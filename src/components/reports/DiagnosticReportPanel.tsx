import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { DiagnosticReport, Role, DisagreementCategory } from '../../types';
import { patientDisplayName } from '../../lib/pii';
import { X, BrainCircuit, FileText, Activity, CheckCircle, AlertTriangle } from 'lucide-react';

interface DiagnosticReportPanelProps {
  patientId: string;
  patientName: string;
  userRole: Role;
  actorId: string;
  onClose: () => void;
}

const categoryDisplay: Record<string, { label: string; dot: string }> = {
  radiology: { label: 'Radiology', dot: 'bg-blue-500' },
  lab: { label: 'Lab', dot: 'bg-rose-500' },
  ocr: { label: 'OCR', dot: 'bg-purple-500' },
  stt: { label: 'STT', dot: 'bg-emerald-500' },
  symptom: { label: 'Symptom', dot: 'bg-amber-500' },
};

export default function DiagnosticReportPanel({ patientId, patientName, userRole, actorId, onClose }: DiagnosticReportPanelProps) {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [activeReportIndex, setActiveReportIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState<string | null>(null);
  const [disagreementCategory, setDisagreementCategory] = useState<DisagreementCategory | null>(null);
  const [note, setNote] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchReports() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.reports.getByPatientId(patientId);
        if (!cancelled) {
          setReports(data);
          setActiveReportIndex(0);
          setReport(data[0] ?? null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to load diagnostic report.');
          setLoading(false);
        }
      }
    }
    fetchReports();
    return () => { cancelled = true; };
  }, [patientId]);

  // Switch active report when index changes
  useEffect(() => {
    setReport(reports[activeReportIndex] ?? null);
  }, [activeReportIndex, reports]);

  const handleVerify = async () => {
    if (!report) return;
    setVerifying(true);
    try {
      await api.reports.verify(report.id, actorId, userRole, override, note, disagreementCategory || undefined);
      setReport(prev => prev ? {
        ...prev,
        status: 'verified',
        verifiedBy: actorId,
        verifiedAt: new Date().toISOString(),
        clinicianTriageOverride: override,
        reviewNote: note,
        clinicianAgreement: override === null,
        disagreementCategory: override ? disagreementCategory || 'Other' : null,
      } : null);
    } catch (err) {
      console.error('Verification failed:', err);
    } finally {
      setVerifying(false);
    }
  };

  const activeReport = report;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Slide-over Panel */}
      <div className="fixed right-0 top-0 h-full w-[520px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col animate-in slide-in-from-right">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
              <FileText size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 truncate">{patientDisplayName(userRole, patientName)}</h2>
              <p className="text-xs font-mono text-slate-400 truncate">Patient ID: {patientId.substring(0, 12)}...</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-full text-slate-400 font-mono text-sm animate-pulse">
              LOADING DIAGNOSTIC REPORT...
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <AlertTriangle size={40} className="text-rose-300 mb-4" />
              <p className="text-sm font-medium text-slate-600">{error}</p>
              <button onClick={onClose} className="mt-4 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                Close panel
              </button>
            </div>
          )}

          {!loading && !error && reports.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <FileText size={40} className="text-slate-300 mb-4" />
              <p className="text-sm font-medium text-slate-500">No diagnostic reports found</p>
              <p className="text-xs text-slate-400 mt-1">LLM inference results will appear here once processed.</p>
            </div>
          )}

          {!loading && !error && reports.length > 1 && (
            <div className="px-6 pt-4 pb-2 flex gap-2 overflow-x-auto">
              {reports.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => setActiveReportIndex(i)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap ${
                    i === activeReportIndex
                      ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {categoryDisplay[r.category]?.label || r.category} — {new Date(r.createdAt).toLocaleDateString()}
                </button>
              ))}
            </div>
          )}

          {!loading && !error && activeReport && (
            <div className="p-6 space-y-6">
              {/* Report Metadata Strip */}
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-indigo-50 text-indigo-700 border-indigo-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  {categoryDisplay[activeReport.category]?.label || activeReport.category}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  activeReport.status === 'verified'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : activeReport.status === 'flagged'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  {activeReport.status === 'verified' ? <CheckCircle size={12} /> : activeReport.status === 'flagged' ? <AlertTriangle size={12} /> : <Activity size={12} />}
                  {activeReport.status}
                </span>
                <span className="text-xs text-slate-400 font-mono">{activeReport.subType}</span>
              </div>

              {/* Confidence Bar */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI Confidence</span>
                  <span className={`text-sm font-bold font-mono ${
                    activeReport.confidence >= 0.8 ? 'text-emerald-600' :
                    activeReport.confidence >= 0.5 ? 'text-amber-600' : 'text-rose-600'
                  }`}>
                    {Math.round(activeReport.confidence * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      activeReport.confidence >= 0.8 ? 'bg-emerald-500' :
                      activeReport.confidence >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.round(activeReport.confidence * 100)}%` }}
                  />
                </div>
              </div>

              <hr className="border-slate-100" />

              {/* AI Analysis */}
              {activeReport.content.aiAnalysis && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <BrainCircuit size={16} className="text-indigo-500" />
                    <h3 className="text-sm font-bold text-slate-700">AI Analysis</h3>
                  </div>
                  <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {activeReport.content.aiAnalysis}
                  </div>
                </div>
              )}

              {/* Structured Data */}
              {activeReport.content.structuredData && Object.keys(activeReport.content.structuredData).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Activity size={16} className="text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-700">Extracted Metrics</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(activeReport.content.structuredData).map(([key, value]) => (
                      <div key={key} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</span>
                        <span className="text-sm font-mono font-bold text-slate-700 mt-0.5">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw Text */}
              {activeReport.content.rawText && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-slate-500" />
                    <h3 className="text-sm font-bold text-slate-700">Raw Extraction</h3>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-600 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {activeReport.content.rawText}
                  </div>
                </div>
              )}

              {/* Verification Info */}
              {activeReport.verifiedBy && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
                  <span className="text-xs text-emerald-700">
                    Verified by <span className="font-mono font-bold">{activeReport.verifiedBy.substring(0, 8)}</span>
                    {activeReport.verifiedAt && <> at {new Date(activeReport.verifiedAt).toLocaleTimeString()}</>}
                  </span>
                </div>
              )}

              {activeReport.flagReason && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-rose-500 flex-shrink-0" />
                  <span className="text-xs text-rose-700">Flagged: {activeReport.flagReason}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Clinical Verification Section ── */}
        {!loading && !error && activeReport && activeReport.status === 'pending' && (
          <div className="border-t border-slate-100 px-6 py-5 space-y-4 flex-shrink-0 bg-white">
            <h4 className="text-sm font-semibold text-slate-900">Clinical Verification</h4>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Triage Override (Optional)</label>
              <select
                value={override || 'None'}
                onChange={(e) => {
                  const val = e.target.value === 'None' ? null : e.target.value;
                  setOverride(val);
                  // Reset category when choosing "Agree"
                  if (!val) setDisagreementCategory(null);
                }}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700"
              >
                <option value="None">None (Agree with AI)</option>
                <option value="Emergency">Emergency</option>
                <option value="Urgent">Urgent</option>
                <option value="Doctor">Doctor</option>
                <option value="Self-care">Self-care</option>
              </select>
            </div>

            {/* Disagreement Category — only visible when an override is selected */}
            {override && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Reason for Disagreement</label>
                <select
                  value={disagreementCategory || 'Other'}
                  onChange={(e) => setDisagreementCategory(e.target.value as DisagreementCategory)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white text-slate-700"
                >
                  <option value="Other">Select a reason...</option>
                  <option value="Hallucination">AI Hallucination</option>
                  <option value="Context Insufficiency">Missing Context</option>
                  <option value="Threshold Mismatch">Threshold Mismatch</option>
                  <option value="Policy Evolution">Outdated Policy</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Review Notes</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional clinical observations..."
                rows={3}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none bg-white text-slate-700 placeholder:text-slate-400"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={verifying}
              className="w-full py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Mark as Reviewed'}
            </button>
          </div>
        )}

        {/* ── Footer — Already Reviewed ── */}
        {!loading && !error && activeReport && activeReport.status === 'verified' && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0 bg-slate-50/50">
            <div className="text-[11px] text-slate-400 font-mono">
              Created: {new Date(activeReport.createdAt).toLocaleString()}
            </div>
            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle size={14} /> Reviewed
            </span>
          </div>
        )}
      </div>
    </>
  );
}
