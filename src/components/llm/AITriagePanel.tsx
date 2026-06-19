import React, { useState } from 'react';
import { api } from '../../lib/api';
import { TriageResult, TriageRecord } from '../../types';
import { BrainCircuit, AlertTriangle, Clock, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { patientDisplayName } from '../../lib/pii';

interface AITriagePanelProps {
  patient: TriageRecord;
  onClose: () => void;
}

/**
 * Maps the LLM urgency_level string to our portal's category theme.
 */
const urgencyTheme: Record<string, { dot: string; bg: string; text: string; border: string; label: string }> = {
  emergency_referral: {
    dot: 'bg-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    label: 'Emergency Referral',
  },
  urgent_care: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    label: 'Urgent Care',
  },
  doctor_consultation: {
    dot: 'bg-indigo-500',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    label: 'Doctor Consultation',
  },
  self_care: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    label: 'Self-care',
  },
};

function getUrgencyTheme(level: string) {
  return urgencyTheme[level] || {
    dot: 'bg-slate-500',
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    label: level.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
  };
}

export default function AITriagePanel({ patient, onClose }: AITriagePanelProps) {
  const [result, setResult] = useState<TriageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleRunTriage = async () => {
    setLoading(true);
    setError(null);
    try {
      const symptoms = `${patient.triageCategory} triage — ${patient.status} — confidence ${Math.round(patient.confidence * 100)}%`;
      const result = await api.llm.triage({
        symptoms,
        patient_case: `Triage case: ${patient.triageCategory} with ${Math.round(patient.confidence * 100)}% confidence. Status: ${patient.status}.`,
        chief_complaint: `Triage category: ${patient.triageCategory}`,
      });
      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI Triage request failed');
    } finally {
      setLoading(false);
    }
  };

  const theme = result ? getUrgencyTheme(result.urgency_level) : null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900">AI Triage Analysis</h3>
        </div>
        {!result && !loading && (
          <button
            onClick={handleRunTriage}
            className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <BrainCircuit size={14} />
            Run AI Triage
          </button>
        )}
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="px-5 py-4">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-rose-700">Triage request failed</p>
              <p className="text-xs text-rose-600 mt-1 font-mono">{error}</p>
              <button
                onClick={handleRunTriage}
                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div className="px-5 py-8 flex flex-col items-center justify-center text-center">
          <Loader2 size={24} className="text-indigo-500 animate-spin mb-3" />
          <p className="text-sm font-medium text-slate-600">Running AI Triage Analysis</p>
          <p className="text-xs text-slate-400 mt-1">Querying model: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning</p>
        </div>
      )}

      {/* ── Result Display ── */}
      {result && !loading && (
        <div className="px-5 py-4 space-y-4">
          {/* Urgency Level Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${theme?.bg} ${theme?.text} ${theme?.border}`}>
                <span className={`w-2 h-2 rounded-full ${theme?.dot}`} />
                {theme?.label}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              <Clock size={12} />
              <span>{result.latency_ms}ms</span>
            </div>
          </div>

          {/* Reasoning */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Clinical Reasoning</h4>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs text-slate-700 leading-relaxed">
              {result.reasoning}
            </div>
          </div>

          {/* Next Steps */}
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Recommended Next Steps</h4>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-700 leading-relaxed">
              {result.next_steps}
            </div>
          </div>

          {/* Red Flags */}
          {result.red_flags && result.red_flags.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-500 mb-1.5 flex items-center gap-1">
                <AlertTriangle size={12} />
                Red Flags
              </h4>
              <ul className="space-y-1">
                {result.red_flags.map((flag, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-rose-700">
                    <span className="text-rose-400 mt-0.5">•</span>
                    {flag}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Disclaimer (collapsible) */}
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Disclaimer
            </button>
            {expanded && (
              <p className="mt-1 text-[10px] text-slate-400 italic leading-relaxed">
                {result.disclaimer}
              </p>
            )}
          </div>

          {/* Session ID */}
          <div className="text-[10px] text-slate-400 font-mono">
            Session: {result.session_id.substring(0, 16)}...
          </div>
        </div>
      )}
    </div>
  );
}
