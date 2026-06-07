import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, TriageRecord, CaseStatus } from '../types';
import { can } from '../lib/rbac';
import { useAuth } from '../context/AuthContext';
import { patientDisplayName } from '../lib/pii';
import { Users, BrainCircuit, Activity, FileText } from 'lucide-react';
import DiagnosticReportPanel from '../components/reports/DiagnosticReportPanel';

// ── Category theme (Preclinic design tokens) ──
const categoryTheme: Record<string, { dot: string; badge: string; label: string }> = {
  Emergency: { dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-100', label: 'Emergency' },
  Urgent: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-100', label: 'Urgent' },
  Doctor: { dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-1 ring-indigo-100', label: 'Doctor' },
  'Self-care': { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-100', label: 'Self-care' },
};

const statusStyles: Record<CaseStatus, string> = {
  Registered: 'text-slate-600 bg-slate-50 border-slate-200',
  'In Triage': 'text-indigo-600 bg-indigo-50 border-indigo-200',
  'Needs Review': 'text-amber-600 bg-amber-50 border-amber-200',
  Escalated: 'text-rose-600 bg-rose-50 border-rose-200',
  Resolved: 'text-emerald-600 bg-emerald-50 border-emerald-200',
};

const statusDot: Record<CaseStatus, string> = {
  Registered: 'bg-slate-400',
  'In Triage': 'bg-indigo-500',
  'Needs Review': 'bg-amber-500',
  Escalated: 'bg-rose-500',
  Resolved: 'bg-emerald-500',
};

export default function TriageQueue({ userRole }: { userRole: Role }) {
  const { user: currentUser } = useAuth();
  const [records, setRecords] = useState<TriageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [selectedRecord, setSelectedRecord] = useState<TriageRecord | null>(null);
  const [selectedReportPatient, setSelectedReportPatient] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchPatients() {
      try {
        const data = await api.patients.getAll();
        if (!cancelled) {
          setRecords(data);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch triage records:', err);
      }
    }
    fetchPatients();
    const interval = setInterval(fetchPatients, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleStatusTransition = useCallback(async (record: TriageRecord, newStatus: CaseStatus) => {
    const userId = currentUser?.uid || 'unknown';
    try {
      await api.patients.updateStatus(record.id, newStatus, userId, userRole, `Transitioned to ${newStatus}`);
      // Refetch on success to sync with server
      const data = await api.patients.getAll();
      setRecords(data);
    } catch (err) {
      console.error('Status transition failed:', err);
    }
  }, [currentUser, userRole]);

  // ── Derived metrics ──
  const totalVolume = records.length;
  const inProgressRate = records.length > 0
    ? Math.round((records.filter(r => r.status === 'Resolved' || r.status === 'In Triage').length / records.length) * 100)
    : 0;
  const pendingReview = records.filter(r => r.status === 'Needs Review' || r.status === 'Escalated').length;

  const filteredRecords = records.filter(r =>
    (filterCategory === 'All' || r.triageCategory === filterCategory) &&
    (patientDisplayName(userRole, r.patientName).toLowerCase().includes(searchTerm.toLowerCase()) ||
     r.id.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400 font-mono text-sm animate-pulse">
        LOADING TRIAGE QUEUE...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Triage Queue</h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time patient triage assignments and AI confidence scoring.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
            Export Report
          </button>
        </div>
      </div>

      {/* ── KPI Summary Row ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Triage Volume</p>
              <h3 className="text-3xl font-bold text-slate-900">{totalVolume}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-emerald-600">
            <span>Active Registry</span>
            <span className="text-slate-400 ml-2 font-normal">real-time count</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">In Progress Rate</p>
              <h3 className="text-3xl font-bold text-slate-900">{inProgressRate}%</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <BrainCircuit size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-emerald-600">
            <span>Active Pipeline</span>
            <span className="text-slate-400 ml-2 font-normal">In Triage / Resolved</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Active Cases</p>
              <h3 className="text-3xl font-bold text-slate-900">{records.filter(r => r.status !== 'Resolved').length}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Users size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-amber-600">
            <span>In Progress</span>
            <span className="text-slate-400 ml-2 font-normal">excluding resolved</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100 flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Pending Human Review</p>
              <h3 className="text-3xl font-bold text-slate-900">{pendingReview}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-rose-600">
            <span>{pendingReview > 0 ? 'Requires attention' : 'All clear'}</span>
            <span className="text-slate-400 ml-2 font-normal">Needs Review / Escalated</span>
          </div>
        </div>
      </div>

      {/* ── Filter Controls ── */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <input
          type="text"
          placeholder="Search by patient name or case ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 font-medium"
        >
          <option value="All">All Categories</option>
          <option value="Emergency">Emergency</option>
          <option value="Urgent">Urgent</option>
          <option value="Doctor">Doctor</option>
          <option value="Self-care">Self-care</option>
        </select>
        <span className="text-xs font-mono text-slate-400 ml-auto">
          {filteredRecords.length} of {records.length} cases
        </span>
      </div>

      {/* ── Data Table ── */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-100 p-16 text-center shadow-sm">
          <Users size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-sm font-medium text-slate-500">No matching triage records found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filter criteria.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                <th className="py-4 px-6">Patient</th>
                <th className="py-4 px-6">Category</th>
                <th className="py-4 px-6">AI Confidence</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Recorded</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredRecords.map((record) => {
                const ct = categoryTheme[record.triageCategory] || categoryTheme['Self-care'];
                return (
                  <tr
                    key={record.id}
                    className="group hover:bg-slate-50/60 transition-colors cursor-pointer"
                    onClick={() => setSelectedRecord(record)}
                  >
                    <td className="py-4 px-6">
                      <div className="text-sm font-medium text-slate-900">
                        {patientDisplayName(userRole, record.patientName)}
                      </div>
                      <div className="text-xs font-mono text-slate-400 mt-0.5">{record.id.substring(0, 12)}...</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${ct.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${ct.dot}`} />
                        {ct.label}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              record.confidence >= 0.8
                                ? 'bg-emerald-500'
                                : record.confidence >= 0.5
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${Math.round(record.confidence * 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono font-bold ${
                          record.confidence >= 0.8
                            ? 'text-emerald-600'
                            : record.confidence >= 0.5
                              ? 'text-amber-600'
                              : 'text-rose-600'
                        }`}>
                          {Math.round(record.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDot[record.status]}`} />
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyles[record.status]}`}>
                          {record.status}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-500 font-mono">
                      {new Date(record.timestamp).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {record.status === 'Registered' && can(userRole, 'START_TRIAGE') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStatusTransition(record, 'In Triage'); }}
                            className="px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                          >
                            Start Triage
                          </button>
                        )}
                        {record.status === 'In Triage' && can(userRole, 'VIEW_CASE') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedRecord(record); }}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            View
                          </button>
                        )}
                        {record.status === 'Needs Review' && can(userRole, 'ASSIGN_DOCTOR') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStatusTransition(record, 'In Triage'); }}
                            className="px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                          >
                            Assign
                          </button>
                        )}
                        {record.status === 'Escalated' && can(userRole, 'UPDATE_STATUS') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStatusTransition(record, 'Needs Review'); }}
                            className="px-3 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
                          >
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Slide-over Panel for Viewing Diagnostic Reports ── */}
      {selectedRecord && !selectedReportPatient && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => setSelectedRecord(null)}>
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full mx-4 p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{patientDisplayName(userRole, selectedRecord.patientName)}</h3>
                <p className="text-xs font-mono text-slate-400 mt-0.5">{selectedRecord.id}</p>
              </div>
              <button onClick={() => setSelectedRecord(null)} className="text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Category</span>
                <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${categoryTheme[selectedRecord.triageCategory]?.badge || categoryTheme['Self-care'].badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${categoryTheme[selectedRecord.triageCategory]?.dot || categoryTheme['Self-care'].dot}`} />
                  {selectedRecord.triageCategory}
                </span>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confidence</span>
                <span className={`ml-2 text-xs font-bold ${selectedRecord.confidence >= 0.8 ? 'text-emerald-600' : selectedRecord.confidence >= 0.5 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {Math.round(selectedRecord.confidence * 100)}%
                </span>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full border ${statusStyles[selectedRecord.status]}`}>
                  {selectedRecord.status}
                </span>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Recorded</span>
                <span className="ml-2 text-xs text-slate-600">{new Date(selectedRecord.timestamp).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setSelectedReportPatient({ id: selectedRecord.id, name: selectedRecord.patientName }); }}
                className="flex-1 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
              >
                <FileText size={14} /> View Diagnostic Report
              </button>
              <button
                onClick={() => setSelectedRecord(null)}
                className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedReportPatient && (
        <DiagnosticReportPanel
          patientId={selectedReportPatient.id}
          patientName={selectedReportPatient.name}
          userRole={userRole}
          actorId={currentUser?.uid ?? 'unknown'}
          onClose={() => { setSelectedReportPatient(null); setSelectedRecord(null); }}
        />
      )}
    </div>
  );
}
