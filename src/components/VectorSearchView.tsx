import React, { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { Role, VectorSearchMatch } from '../types';
import { Search, Activity, Brain, FileText, AlertCircle, TrendingUp, ArrowRight, Loader2, Database } from 'lucide-react';

interface VectorSearchViewProps {
  userRole: Role;
}

const categoryBadge: Record<string, string> = {
  Emergency: 'bg-rose-50 text-rose-700 border-rose-200',
  Urgent: 'bg-amber-50 text-amber-700 border-amber-200',
  Doctor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Self-care': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function VectorSearchView({ userRole }: VectorSearchViewProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VectorSearchMatch[]>([]);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexStats, setIndexStats] = useState<{
    indexedCount: number;
    totalInIndex: number;
  } | null>(null);
  const [filterSource, setFilterSource] = useState<string>('all');

  const handleSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const filters = filterSource !== 'all'
        ? { sourceType: filterSource as 'patient' | 'report' }
        : undefined;

      const result = await api.vectorSearch.search(trimmed, 12, filters);
      setResults(result.matches);
      setSearchedQuery(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed. Check that the vector index has been seeded.');
      console.error('[VectorSearch] Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [query, filterSource]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleIndexAll = async () => {
    setIndexing(true);
    setError(null);
    try {
      const stats = await api.vectorSearch.indexAll();
      setIndexStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Indexing failed.');
    } finally {
      setIndexing(false);
    }
  };

  const handleSimilaritySearch = async (match: VectorSearchMatch) => {
    setLoading(true);
    setError(null);
    try {
      const meta = match.metadata;
      const caseText = [
        `Patient: ${meta.patientName}`,
        `Triage Category: ${meta.triageCategory}`,
        `Status: ${meta.status}`,
      ].join(' ');
      const result = await api.vectorSearch.getSimilarCases(caseText, 6);
      setResults(result.matches);
      setSearchedQuery(`Similar to: ${meta.patientName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Similarity lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Semantic Triage Search
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            AI-powered vector search across indexed triage cases and diagnostic reports using Pinecone.
          </p>
        </div>
        <button
          onClick={handleIndexAll}
          disabled={indexing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          <Database size={16} />
          {indexing ? 'Indexing...' : 'Re-index All'}
        </button>
      </div>

      {/* Index stats banner */}
      {indexStats && (
        <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <TrendingUp size={18} />
          <span>
            Indexed <strong>{indexStats.indexedCount}</strong> vectors.
            Total in index: <strong>{indexStats.totalInIndex}</strong>.
          </span>
        </div>
      )}

      {/* ── Search Bar ── */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the case you're looking for... e.g., 'cardiac patient with chest pain escalated to emergency'"
              className="w-full pl-10 pr-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
          </div>
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 font-medium"
          >
            <option value="all">All Sources</option>
            <option value="patient">Patients</option>
            <option value="report">Reports</option>
          </select>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Uses Pinecone vector database with OpenAI embeddings for semantic similarity.
          {!indexStats && ' Click "Re-index All" to seed the index with existing cases.'}
        </p>
      </div>

      {/* ── Error State ── */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Search Error</p>
            <p className="text-rose-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 size={28} className="animate-spin text-indigo-500" />
            <p className="text-sm font-mono animate-pulse">
              QUERYING VECTOR INDEX...
            </p>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && !error && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              Results for "<span className="font-medium text-slate-700">{searchedQuery}</span>"
            </p>
            <p className="text-xs font-mono text-slate-400">
              {results.length} matches
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((match) => {
              const meta = match.metadata;
              const badge = categoryBadge[meta.triageCategory] || 'bg-slate-50 text-slate-600 border-slate-200';
              const sourceIcon = meta.sourceType === 'patient' ? <Activity size={14} /> : <FileText size={14} />;
              const sourceLabel = meta.sourceType === 'patient' ? 'Patient Case' : 'Diagnostic Report';

              return (
                <div
                  key={match.id}
                  className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group"
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        meta.sourceType === 'patient' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {sourceIcon}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 truncate">{meta.patientName}</h3>
                        <p className="text-[10px] font-mono text-slate-400 uppercase">{sourceLabel}</p>
                      </div>
                    </div>
                    {/* Similarity score */}
                    <div className="flex items-center gap-1 px-2 py-1 bg-indigo-50 rounded-lg flex-shrink-0">
                      <span className="text-[10px] font-bold text-indigo-600 font-mono">
                        {Math.round(match.score * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Metadata chips */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge}`}>
                      {meta.triageCategory}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        meta.status === 'Resolved' ? 'bg-emerald-500' :
                        meta.status === 'Escalated' ? 'bg-rose-500' :
                        meta.status === 'In Triage' ? 'bg-indigo-500' :
                        meta.status === 'Needs Review' ? 'bg-amber-500' : 'bg-slate-400'
                      }`} />
                      {meta.status}
                    </span>
                    {meta.confidence > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <Brain size={10} />
                        {Math.round(meta.confidence * (meta.confidence > 1 ? 1 : 100))}%
                      </span>
                    )}
                    {meta.reportCategory && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <FileText size={10} />
                        {meta.reportCategory}
                      </span>
                    )}
                  </div>

                  {/* Document ID and timestamp */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="truncate max-w-[180px]">{match.id.substring(0, 20)}...</span>
                    <span>{new Date(meta.timestamp).toLocaleDateString()}</span>
                  </div>

                  {/* Similarity action */}
                  <button
                    onClick={() => handleSimilaritySearch(match)}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-indigo-600 bg-indigo-50/50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <TrendingUp size={12} />
                    Find Similar Cases
                    <ArrowRight size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Empty State (searched but no results) ── */}
      {!loading && !error && searchedQuery && results.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Search size={40} className="text-slate-300 mb-4" />
          <p className="text-sm font-medium text-slate-500">No matching cases found</p>
          <p className="text-xs text-slate-400 mt-1">
            Try a different search query or re-index the database.
          </p>
        </div>
      )}

      {/* ── Initial State ── */}
      {!loading && !error && !searchedQuery && results.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Brain size={48} className="text-slate-200 mb-4" />
          <p className="text-sm font-medium text-slate-500">Semantic Vector Search</p>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            Search across all triage cases using natural language. Results are ranked by
            semantic similarity using Pinecone vector database and OpenAI embeddings.
          </p>
          <div className="flex gap-6 mt-6 text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <Activity size={14} className="text-indigo-400" />
              Patient Cases
            </div>
            <div className="flex items-center gap-1.5">
              <FileText size={14} className="text-emerald-400" />
              Diagnostic Reports
            </div>
            <div className="flex items-center gap-1.5">
              <Brain size={14} className="text-amber-400" />
              Semantic Similarity
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
