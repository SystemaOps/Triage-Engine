import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { LLMHealth, TriageHistoryEntry } from '../../types';
import { BrainCircuit, Activity, RefreshCw, Clock, CheckCircle, AlertTriangle, Loader2, Database, Sparkles } from 'lucide-react';

export default function RAGDashboard() {
  const [health, setHealth] = useState<LLMHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{ status: string; message: string } | null>(null);

  // Track triage history in memory for this session
  const [triageHistory, setTriageHistory] = useState<TriageHistoryEntry[]>([]);

  // ── Health Check ──
  const fetchHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const result = await api.llm.health();
      setHealth(result);
    } catch (err) {
      setHealthError(err instanceof Error ? err.message : 'Failed to fetch LLM health');
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Rebuild BM25 Index ──
  const handleRebuildIndex = async () => {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const result = await api.llm.rebuildIndex();
      setRebuildResult(result);
    } catch (err) {
      setRebuildResult({
        status: 'error',
        message: err instanceof Error ? err.message : 'Rebuild failed',
      });
    } finally {
      setRebuilding(false);
    }
  };

  // ── Loading State ──
  if (healthLoading && !health) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-slate-400 font-mono text-sm animate-pulse">
        CONNECTING TO LLM PIPELINE...
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">RAG Pipeline</h1>
          <p className="text-sm text-slate-500 mt-1">
            BM25 keyword retrieval + Nemotron reasoning model for clinical triage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHealth}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {healthError && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-rose-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-rose-700">Pipeline Connection Issue</p>
            <p className="text-xs text-rose-600 mt-1 font-mono">{healthError}</p>
            <button
              onClick={fetchHealth}
              className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Retry connection
            </button>
          </div>
        </div>
      )}

      {/* ── Health Metrics Strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Pipeline Status</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <h3 className="text-sm font-bold text-slate-900">
                  {health?.status === 'ok' ? 'Operational' : 'Degraded'}
                </h3>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <BrainCircuit size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs font-medium text-slate-500 font-mono">
            <span>v{health?.version || '—'}</span>
            <span className="mx-2 text-slate-300">|</span>
            <span>RAG: {health?.rag_ready ? 'Ready' : 'Not Ready'}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Model</p>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                {health?.model || 'Unknown'}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Sparkles size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs font-medium text-slate-500 font-mono">
            <span>via OpenRouter</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Retrieval Method</p>
              <h3 className="text-sm font-bold text-slate-900">BM25</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Database size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs font-medium text-slate-500 font-mono">
            <span>Keyword-based retrieval</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Triages This Session</p>
              <h3 className="text-3xl font-bold text-slate-900">{triageHistory.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-center text-xs font-medium text-slate-500 font-mono">
            <span>Since page load</span>
          </div>
        </div>
      </div>

      {/* ── Pipeline Info & Admin Section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline Details Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Pipeline Architecture</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 flex-shrink-0">
                <Database size={16} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Step 1: BM25 Keyword Retrieval</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Patient symptoms and case text are matched against indexed medical knowledge using
                  BM25 (Best Matching 25) keyword scoring algorithm.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 flex-shrink-0">
                <BrainCircuit size={16} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Step 2: Nemotron Reasoning</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Retrieved context + patient symptoms are fed to the NVIDIA Nemotron 3 30B model
                  for clinical reasoning, urgency classification, and next-step recommendations.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
                <Activity size={16} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-700">Step 3: Response Formatter</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Structured response with urgency level, clinical reasoning, next steps, and red flag
                  indicators is returned to the admin portal.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Controls Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Admin Controls</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">BM25 Index</p>
              <p className="text-[11px] text-slate-500 mb-3">
                The keyword index is maintained server-side on the Railway instance.
                Rebuild when new clinical knowledge is added.
              </p>
              <button
                onClick={handleRebuildIndex}
                disabled={rebuilding}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {rebuilding ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Rebuilding...
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    Rebuild BM25 Index
                  </>
                )}
              </button>
              {rebuildResult && (
                <div className={`mt-3 p-3 rounded-xl text-xs font-mono ${
                  rebuildResult.status === 'ok' || rebuildResult.status === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  <span className="font-bold">{rebuildResult.status}:</span> {rebuildResult.message}
                </div>
              )}
            </div>

            <hr className="border-slate-100" />

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-1">Endpoint Configuration</p>
              <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 font-mono text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Triage API:</span>
                  <span className="text-slate-700">POST /triage</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Chat API:</span>
                  <span className="text-slate-700">POST /chat</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Health:</span>
                  <span className="text-slate-700">GET /health</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Search Method:</span>
                  <span className="text-slate-700">BM25 (no embeddings)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Monitoring Terminal ── */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-mono text-sm">
            <span className="text-cyan-400">$</span>{' '}
            <span className="text-emerald-400">llm-pipeline</span>{' '}
            <span className="text-slate-500">~ status</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
              health?.status === 'ok'
                ? 'bg-emerald-900 text-emerald-200 animate-pulse'
                : 'bg-rose-900 text-rose-200'
            }`}>
              {health?.status === 'ok' ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
            <Clock size={12} className="text-slate-500" />
          </div>
        </div>
        <div className="font-mono text-xs text-slate-400 space-y-1">
          {health ? (
            <>
              <div className="text-slate-500"># LLM Pipeline Health Check</div>
              <div>status: <span className="text-emerald-400">{health.status}</span></div>
              <div>model: <span className="text-cyan-300">{health.model}</span></div>
              <div>version: <span className="text-slate-300">{health.version}</span></div>
              <div>rag_ready: <span className={health.rag_ready ? 'text-emerald-400' : 'text-rose-400'}>{String(health.rag_ready)}</span></div>
              <div className="text-slate-600 mt-2">
                # Use the AI Triage button on patient cases in the Triage Queue to run analysis
              </div>
            </>
          ) : (
            <span className="text-slate-600">Waiting for pipeline connection...</span>
          )}
        </div>
      </div>
    </div>
  );
}
