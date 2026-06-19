import { useState, useMemo, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { TraceTimeline } from './common/TraceTimeline';
import { StatusBadge } from './common/StatusBadge';
import { Role, TraceEvent, TriageRecord, CaseStatus } from '../types';
import { can } from '../lib/rbac';
import { useAuth } from '../context/AuthContext';
import { patientDisplayName } from '../lib/pii';

const getStatusVariant = (status: CaseStatus): 'info' | 'success' | 'warning' | 'danger' => {
    switch (status) {
        case 'Registered': return 'success';
        case 'In Triage': return 'info';
        case 'Needs Review': return 'warning';
        case 'Escalated': return 'danger';
        case 'Resolved': return 'info';
        default: return 'info';
    }
};

const categoryTheme = (category: string) => {
  switch (category) {
    case 'Emergency': return { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-100/50' };
    case 'Urgent': return { dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-100/50' };
    case 'Doctor': return { dot: 'bg-blue-400', chip: 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-100/50' };
    default: return { dot: 'bg-emerald-400', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-100/50' };
  }
};

const statusDot = (status: CaseStatus) => {
  switch (status) {
    case 'Registered': return 'bg-emerald-500';
    case 'In Triage': return 'bg-blue-400';
    case 'Needs Review': return 'bg-amber-400';
    case 'Escalated': return 'bg-rose-500 animate-pulse';
    case 'Resolved': return 'bg-slate-400';
    default: return 'bg-slate-300';
  }
};

export default function PatientManagementView({ userRole }: { userRole: Role }) {
  const { user: currentUser } = useAuth();
  const [records, setRecords] = useState<TriageRecord[]>([]);
  useEffect(() => {
    api.patients.getAll().then(setRecords);
  }, []);
  const [selectedItem, setSelectedItem] = useState<TriageRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');

  // Adds a local TraceEvent after a successful Firestore write — syncs local state to match server state
  const addTraceEvent = (recordId: string, action: string, fromState?: CaseStatus, toState?: CaseStatus) => {
    const newEvent: TraceEvent = {
        id: Math.random().toString(36).substr(2, 9),
        entityType: 'PATIENT',
        entityId: recordId,
        action,
        performedBy: currentUser?.uid || 'unknown',
        role: userRole,
        timestamp: new Date().toISOString(),
        fromState,
        toState,
        reason: action === 'Start Triage' ? 'Starting triage process' :
                action === 'Assigned Doctor' ? 'Assigned doctor to case' :
                action === 'Acknowledge' ? 'Acknowledged escalation' :
                action === 'Archived' ? 'Case archived' :
                'Clinical action recorded',
    };
    
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, status: toState || r.status, traceEvents: [...r.traceEvents, newEvent] } : r));
    setSelectedItem(prev => prev && prev.id === recordId ? { ...prev, status: toState || prev.status, traceEvents: [...prev.traceEvents, newEvent] } : prev);
  };

  // Persists state transitions to Firestore via the API transaction layer
  const handleStatusTransition = useCallback(async (record: TriageRecord, newStatus: CaseStatus, action: string) => {
    const userId = currentUser?.uid || 'unknown';
    const reason = action === 'Start Triage' ? 'Starting triage process' :
                   action === 'Assigned Doctor' ? 'Assigned doctor to case' :
                   action === 'Acknowledge' ? 'Acknowledged escalation' :
                   'Clinical action recorded';

    try {
      await api.patients.updateStatus(record.id, newStatus, userId, userRole, reason);
      addTraceEvent(record.id, action, record.status, newStatus);
    } catch (err) {
      console.error(`Firestore transaction failed for ${action}:`, err);
    }
  }, [currentUser, userRole]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => 
        (filterCategory === 'All' || r.triageCategory === filterCategory) &&
        (patientDisplayName(userRole, r.patientName).toLowerCase().includes(searchTerm.toLowerCase()) || r.id.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [records, searchTerm, filterCategory]);

  // Fleet metrics
  const totalPatients = records.length;
  const emergencyCount = records.filter(r => r.triageCategory === 'Emergency').length;
  const urgentCount = records.filter(r => r.triageCategory === 'Urgent').length;
  const routineCount = records.filter(r => r.triageCategory === 'Self-care' || r.triageCategory === 'Doctor').length;

  // --- Detail View ---
  if (selectedItem) {
    const ct = categoryTheme(selectedItem.triageCategory);
    return (
      <div className="space-y-6 p-6 max-w-[1600px] mx-auto animate-fade-in">
        {/* Back Navigation */}
        <button
          onClick={() => setSelectedItem(null)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Registry
        </button>

        {/* Case Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Case: {patientDisplayName(userRole, selectedItem.patientName)}
            </h2>
            <p className="text-sm font-mono text-slate-400 mt-1">{selectedItem.id}</p>
          </div>
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold capitalize border ${ct.chip}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ct.dot}`} />
            {selectedItem.triageCategory}
          </div>
        </div>

        <hr className="border-slate-100" />

        {/* Performance Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Triage Category</span>
            <p className="text-xl font-bold text-slate-900 mt-1">{selectedItem.triageCategory}</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Model Confidence</span>
            <p className="text-xl font-bold text-slate-900 mt-1">{(selectedItem.confidence * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Current Status</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${statusDot(selectedItem.status)}`} />
              <span className="text-xl font-bold text-slate-900">{selectedItem.status}</span>
            </div>
          </div>
        </div>

        {/* Case Lifecycle Timeline */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Case Lifecycle Timeline</h3>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              {selectedItem.traceEvents.length} events
            </span>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <TraceTimeline events={selectedItem.traceEvents} />
          </div>
        </div>
      </div>
    );
  }

  // --- List View ---
  return (
    <div className="space-y-6 p-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Structural Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Patient Triage Registry</h2>
        <p className="text-sm text-slate-500">
          Monitor real-time case triage assignments, confidence metrics, and clinical workflow progression.
        </p>
      </div>

      {/* Triage Metrics Summary Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: 'Total Cases', value: totalPatients, sub: 'Active registry', color: 'text-slate-900' },
          { title: 'Emergency', value: emergencyCount, sub: 'Critical response required', color: 'text-rose-600' },
          { title: 'Urgent', value: urgentCount, sub: 'Elevated priority queue', color: 'text-amber-500' },
          { title: 'Routine', value: routineCount, sub: 'Standard care pathway', color: 'text-emerald-600' },
        ].map((card, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-200 shadow-sm p-5 transition-all hover:shadow-md">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-bold">{card.title}</p>
            <p className={`text-3xl font-black font-mono tracking-tight mt-2 ${card.color}`}>{card.value}</p>
            <p className="text-xs text-slate-400 mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Controls Strip */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <input
          type="text"
          placeholder="Search by patient name or case ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 placeholder:text-slate-400"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-700 font-medium"
        >
          <option value="All">All Categories</option>
          <option value="Self-care">Self-care</option>
          <option value="Doctor">Doctor</option>
          <option value="Urgent">Urgent</option>
          <option value="Emergency">Emergency</option>
        </select>
        <span className="text-xs font-mono text-slate-400 ml-auto">
          {filteredRecords.length} of {totalPatients} cases
        </span>
      </div>

      {/* Patient Case Card Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {filteredRecords.map((record) => {
          const ct = categoryTheme(record.triageCategory);
          const sv = getStatusVariant(record.status);
          return (
            <div
              key={record.id}
              onClick={() => setSelectedItem(record)}
              className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group relative overflow-hidden"
            >
              {/* Top accent bar based on category */}
              <div className={`absolute top-0 left-0 right-0 h-1 ${ct.dot}`} />

              {/* Card Header */}
              <div className="flex items-start justify-between mt-1">
                <div>
                  <h4 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {patientDisplayName(userRole, record.patientName)}
                  </h4>
                  <p className="text-xs font-mono text-slate-400 mt-0.5">{record.id}</p>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold capitalize border ${ct.chip}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ct.dot}`} />
                  {record.triageCategory}
                </div>
              </div>

              {/* Telemetry Strip */}
              <div className="grid grid-cols-3 gap-2 bg-slate-50/60 rounded-xl p-3 my-4 border border-slate-50 font-mono text-center">
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Status</span>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(record.status)}`} />
                    <StatusBadge status={record.status} variant={sv} />
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Confidence</span>
                  <span className={`text-xs font-bold ${record.confidence > 0.9 ? 'text-emerald-600' : 'text-slate-700'}`}>
                    {(record.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Recorded</span>
                  <span className="text-xs font-bold text-slate-700">{record.timestamp}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-50">
                {record.status === 'Registered' && can(userRole, 'START_TRIAGE') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusTransition(record, 'In Triage', 'Start Triage'); }}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 shadow-sm transition-all"
                  >
                    Start Triage
                  </button>
                )}
                {record.status === 'In Triage' && can(userRole, 'VIEW_CASE') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedItem(record); }}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 shadow-sm transition-all"
                  >
                    View Progress
                  </button>
                )}
                {record.status === 'Needs Review' && can(userRole, 'ASSIGN_DOCTOR') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusTransition(record, 'In Triage', 'Assigned Doctor'); }}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 shadow-sm transition-all"
                  >
                    Assign Doctor
                  </button>
                )}
                {record.status === 'Escalated' && can(userRole, 'UPDATE_STATUS') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusTransition(record, 'Needs Review', 'Acknowledge'); }}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 shadow-sm transition-all"
                  >
                    Acknowledge
                  </button>
                )}
                {record.status === 'Resolved' && can(userRole, 'RESOLVE_CASE') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStatusTransition(record, 'Resolved', 'Archived'); }}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 shadow-sm transition-all"
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {filteredRecords.length === 0 && (
        <div className="text-center py-12 text-sm font-mono text-slate-400">
          No matching cases found in the current registry filter.
        </div>
      )}
    </div>
  );
}
