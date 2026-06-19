import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { DiagnosticReport, Role, ReportCategory } from '../types';
import { useAuth } from '../context/AuthContext';
import { patientDisplayName } from '../lib/pii';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// ── Category theme map (light mode) ──
const categoryTheme: Record<ReportCategory, { dot: string; bg: string; text: string; border: string; label: string }> = {
  radiology: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    label: 'Radiology',
  },
  lab: {
    dot: 'bg-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    label: 'Lab',
  },
  ocr: {
    dot: 'bg-purple-500',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    label: 'OCR',
  },
  stt: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'STT',
  },
  symptom: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    label: 'Symptom',
  },
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'verified':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'flagged':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
};

export default function ReportManagementView({ userRole }: { userRole: Role }) {
  const { user: currentUser } = useAuth();
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<ReportCategory | 'all'>('all');

  // Live Firestore subscription
  useEffect(() => {
    const unsub = api.reports.subscribeToReports((data) => {
      setReports(data);
      setLoading(false);
    });
    return () => {
      unsub();
      setSelectedReport(null);
    };
  }, []);

  const handleVerify = useCallback(async (reportId: string) => {
    if (!currentUser) return;
    setVerifying(reportId);
    try {
      await api.reports.verify(reportId, currentUser.uid, userRole);
      // The subscription will push the updated report on next poll
    } catch (err) {
      console.error('Verify failed:', err);
    } finally {
      setVerifying(null);
    }
  }, [currentUser, userRole]);

  // ── Derived data ──
  const filteredReports = filterCategory === 'all'
    ? reports
    : reports.filter(r => r.category === filterCategory);

  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const verifiedTodayCount = reports.filter(r => {
    if (r.status !== 'verified' || !r.verifiedAt) return false;
    const today = new Date();
    const verified = new Date(r.verifiedAt);
    return today.toDateString() === verified.toDateString();
  }).length;
  const flaggedCount = reports.filter(r => r.status === 'flagged').length;

  // Data for Category Distribution Chart
  const reportCategories: ReportCategory[] = ['radiology', 'lab', 'ocr', 'stt', 'symptom'];
  const categoryData = reportCategories.map(category => ({
    name: categoryTheme[category].label,
    count: reports.filter(r => r.category === category).length,
  }));

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center font-mono text-xs text-slate-400 animate-pulse tracking-widest">
        SYNCHRONIZING DIAGNOSTIC REPORT QUEUE...
      </div>
    );
  }

  // ── Empty state ──
  if (reports.length === 0) {
    return (
      <div className="space-y-6 p-6 max-w-[1600px] mx-auto animate-fade-in">
        <div className="border-b border-slate-200 pb-5">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Diagnostic &amp; Audit Ledger</h2>
          <p className="text-sm text-slate-500">Radiology logs, lab results, OCR transcriptions, and symptom analysis queue.</p>
        </div>
        <div className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-2xl bg-slate-50 p-16 text-center">
          <svg className="w-12 h-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-sm font-mono font-bold text-slate-500">QUEUE CLEAR</span>
          <span className="text-xs text-slate-500 mt-1">No pending diagnostic reports at this time.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-7rem)] p-6 max-w-[1600px] mx-auto animate-fade-in flex flex-col">
      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-shrink-0 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Diagnostic &amp; Audit Ledger</h2>
          <p className="text-sm text-slate-500">Radiology logs, lab results, OCR transcriptions, and symptom analysis queue.</p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-slate-500 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>{reports.length} Total Records</span>
        </div>
      </div>

      {/* ── Metrics Strip ── */}
      <div className="grid grid-cols-3 gap-4 py-4 flex-shrink-0">
        {[
          { title: 'Pending Review', value: pendingCount, color: 'text-amber-600', bg: 'bg-amber-50' },
          { title: 'Verified Today', value: verifiedTodayCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { title: 'Flagged', value: flaggedCount, color: 'text-rose-600', bg: 'bg-rose-50' },
        ].map((card, i) => (
          <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">{card.title}</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-2xl font-bold tracking-tight ${card.color}`}>{card.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Split Pane ── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ═══ Left: Queue List ═══ */}
        <div className="lg:col-span-3 flex flex-col min-h-0">
          {/* Category filter tabs */}
          <div className="flex gap-1.5 mb-3 flex-shrink-0 overflow-x-auto">
            {(['all', 'radiology', 'lab', 'ocr', 'stt', 'symptom'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 text-[11px] font-bold font-mono uppercase tracking-wider rounded-lg border transition-all whitespace-nowrap ${
                  filterCategory === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cat === 'all' ? 'All' : categoryTheme[cat].label}
              </button>
            ))}
          </div>

          {/* Scrollable queue */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filteredReports.length === 0 ? (
              <div className="flex items-center justify-center h-full border border-dashed border-slate-300 rounded-xl bg-slate-50">
                <span className="text-xs font-mono text-slate-400">No reports match the selected filter.</span>
              </div>
            ) : (
              filteredReports.map((report) => {
                const ct = categoryTheme[report.category];
                const isSelected = selectedReport?.id === report.id;
                return (
                  <div
                    key={report.id}
                    onClick={() => setSelectedReport(report)}
                    className={`bg-white border rounded-xl p-4 cursor-pointer transition-all duration-150 ${
                      isSelected
                        ? 'border-blue-600 shadow-md ring-1 ring-blue-600/50'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="font-bold text-sm text-slate-900 truncate">{patientDisplayName(userRole, report.patientName)}</h4>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${ct.bg} ${ct.text} ${ct.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${ct.dot}`} />
                          {ct.label}
                        </span>
                      </div>
                      <span className={`ml-2 flex-shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full border ${statusBadge(report.status)}`}>
                        {report.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500 font-mono">
                      <span>{report.subType}</span>
                      <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                      <span className={`font-bold ${report.confidence >= 0.8 ? 'text-emerald-600' : report.confidence >= 0.5 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {Math.round(report.confidence * 100)}% conf.
                      </span>
                    </div>
                  </div>
                );
              }))}
          </div>
        </div>

        {/* ═══ Right: Detail Pane & Data Visualization ═══ */}
        <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Data Visualization */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 h-60 flex flex-col">
                <h3 className="text-md font-bold text-slate-900 mb-2">Report Category Distribution</h3>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart
                        data={categoryData}
                        margin={{
                            top: 5, right: 10, left: 0, bottom: 5,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" stroke="#94a3b8" />
                        <YAxis stroke="#94a3b8" />
                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#334155' }} />
                        <Legend wrapperStyle={{ color: '#334155' }} />
                        <Bar dataKey="count" fill="#3b82f6" name="Reports" />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Report Details */}
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-y-auto">
              {selectedReport ? (
                <div className="p-5 space-y-5">
                  {/* Report header */}
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900">{patientDisplayName(userRole, selectedReport.patientName)}</h3>
                        <p className="text-xs font-mono text-slate-500">{selectedReport.id}</p>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${statusBadge(selectedReport.status)}`}>
                        {selectedReport.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${categoryTheme[selectedReport.category].bg} ${categoryTheme[selectedReport.category].text} ${categoryTheme[selectedReport.category].border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${categoryTheme[selectedReport.category].dot}`} />
                        {categoryTheme[selectedReport.category].label}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">{selectedReport.subType}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{new Date(selectedReport.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Confidence bar */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[11px] font-bold uppercase text-slate-500">AI Confidence</span>
                      <span className="text-xs font-mono font-bold text-slate-700">{Math.round(selectedReport.confidence * 100)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          selectedReport.confidence >= 0.8 ? 'bg-emerald-500' :
                          selectedReport.confidence >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.round(selectedReport.confidence * 100)}%` }}
                      />
                    </div>
                  </div>

                  <hr className="border-slate-200" />

                  {/* Raw text content */}
                  {selectedReport.content.rawText && (
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Raw Extraction</h4>
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed max-h-[200px] overflow-y-auto">
                        {selectedReport.content.rawText}
                      </div>
                    </div>
                  )}

                  {/* Structured data */}
                  {selectedReport.content.structuredData && Object.keys(selectedReport.content.structuredData).length > 0 && (
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Extracted Metrics</h4>
                      <div className="space-y-1.5">
                        {Object.entries(selectedReport.content.structuredData).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
                            <span className="text-xs font-mono text-slate-500 capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className="text-xs font-bold font-mono text-slate-800">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AI analysis */}
                  {selectedReport.content.aiAnalysis && (
                    <div>
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">AI Analysis</h4>
                      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed">
                        {selectedReport.content.aiAnalysis}
                      </div>
                    </div>
                  )}

                  {/* Verify / metadata footer */}
                  <hr className="border-slate-200" />
                  <div className="flex items-center justify-between">
                    {selectedReport.status === 'verified' && selectedReport.verifiedBy ? (
                      <div className="text-[11px] text-slate-500 font-mono">
                        Verified by <span className="font-bold text-slate-700">{selectedReport.verifiedBy.substring(0, 8)}</span>
                        {selectedReport.verifiedAt && (
                          <> at {new Date(selectedReport.verifiedAt).toLocaleTimeString()}</>
                        )}
                      </div>
                    ) : selectedReport.status === 'flagged' && selectedReport.flagReason ? (
                      <div className="text-[11px] text-rose-600 font-mono">
                        Flagged: {selectedReport.flagReason}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 font-mono">Awaiting human verification</div>
                    )}

                    {selectedReport.status === 'pending' && (
                      <button
                        onClick={() => handleVerify(selectedReport.id)}
                        disabled={verifying === selectedReport.id || !currentUser}
                        className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all disabled:opacity-50"
                      >
                        {verifying === selectedReport.id ? 'Verifying...' : 'Verify & Approve'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
                  <svg className="w-10 h-10 text-slate-400 mb-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <span className="text-xs font-mono font-bold text-slate-500">Select a Report</span>
                  <span className="text-[11px] text-slate-500 mt-1">Choose a report from the queue to review its diagnostic data.</span>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}