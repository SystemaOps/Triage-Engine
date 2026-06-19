import React, { useMemo, useState } from 'react';
import { DiagnosticReport, DisagreementCategory, RetrainThresholds } from '../../types';
import { TrendingUp, AlertCircle, CheckCircle, ArrowUp, ArrowDown, Minus, X } from 'lucide-react';

interface DriftMonitorProps {
  reports: DiagnosticReport[];
  thresholds?: RetrainThresholds;
}

const CATEGORY_META: Record<string, { label: string; barColor: string; badgeColor: string }> = {
  Hallucination: { label: 'Hallucination', barColor: 'bg-rose-500', badgeColor: 'bg-rose-50 text-rose-700' },
  'Context Insufficiency': { label: 'Missing Context', barColor: 'bg-amber-500', badgeColor: 'bg-amber-50 text-amber-700' },
  'Threshold Mismatch': { label: 'Threshold Mismatch', barColor: 'bg-purple-500', badgeColor: 'bg-purple-50 text-purple-700' },
  'Policy Evolution': { label: 'Policy Evolution', barColor: 'bg-cyan-500', badgeColor: 'bg-cyan-50 text-cyan-700' },
  Other: { label: 'Other', barColor: 'bg-slate-400', badgeColor: 'bg-slate-50 text-slate-500' },
};

const CATEGORY_ORDER: DisagreementCategory[] = [
  'Hallucination',
  'Context Insufficiency',
  'Threshold Mismatch',
  'Policy Evolution',
  'Other',
];

export default function DriftMonitor({ reports, thresholds }: DriftMonitorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const stats = useMemo(() => {
    const verified = reports.filter(r => r.status === 'verified');
    const total = verified.length;
    const agreed = verified.filter(r => r.clinicianAgreement).length;
    const rate = total > 0 ? (agreed / total) * 100 : 100;

    const disagreements = verified
      .filter(r => r.clinicianAgreement === false)
      .sort((a, b) => new Date(b.verifiedAt || 0).getTime() - new Date(a.verifiedAt || 0).getTime());

    // Compute per-category stats
    const categoryMap = new Map<string, { count: number; records: DiagnosticReport[] }>();
    CATEGORY_ORDER.forEach(cat => categoryMap.set(cat, { count: 0, records: [] }));

    disagreements.forEach(r => {
      const cat = r.disagreementCategory || 'Other';
      if (!categoryMap.has(cat)) categoryMap.set(cat, { count: 0, records: [] });
      const entry = categoryMap.get(cat)!;
      entry.count++;
      entry.records.push(r);
    });

    const categoryStats = CATEGORY_ORDER.map(cat => ({
      category: cat,
      count: categoryMap.get(cat)?.count || 0,
      records: categoryMap.get(cat)?.records || [],
      percentage: disagreements.length > 0
        ? ((categoryMap.get(cat)?.count || 0) / disagreements.length) * 100
        : 0,
    }));

    // Trend: compare recent half vs older half of disagreements
    const midpoint = Math.floor(disagreements.length / 2);
    const recentHalf = disagreements.slice(0, midpoint);
    const priorHalf = disagreements.slice(midpoint);

    const countIn = (arr: DiagnosticReport[], cat: string) =>
      arr.filter(r => (r.disagreementCategory || 'Other') === cat).length;

    const categoryTrends = CATEGORY_ORDER.map(cat => {
      const recent = countIn(recentHalf, cat);
      const prior = countIn(priorHalf, cat);
      let trend: 'up' | 'down' | 'stable';
      if (recent > prior) trend = 'up';
      else if (recent < prior) trend = 'down';
      else trend = 'stable';
      // Only show trend if there's at least 1 disagreement in either half
      if (recent === 0 && prior === 0) trend = 'stable';
      return { category: cat, trend, recent, prior };
    });

    return {
      total,
      rate,
      disagreements,
      categoryStats,
      categoryTrends,
    };
  }, [reports]);

  const filteredDisagreements = useMemo(() => {
    if (!activeCategory) return stats.disagreements.slice(0, 5);
    return stats.disagreements
      .filter(r => (r.disagreementCategory || 'Other') === activeCategory)
      .slice(0, 5);
  }, [stats.disagreements, activeCategory]);

  const toggleCategory = (cat: string) => {
    setActiveCategory(prev => prev === cat ? null : cat);
  };

  const getStatusColor = (rate: number) => {
    if (rate >= 85) return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    if (rate >= 70) return 'text-amber-600 bg-amber-50 border-amber-100';
    return 'text-rose-600 bg-rose-50 border-rose-100';
  };

  const getTrendIcon = (trend: 'up' | 'down' | 'stable') => {
    if (trend === 'up') return <ArrowUp size={12} className="text-rose-500" />;
    if (trend === 'down') return <ArrowDown size={12} className="text-emerald-500" />;
    return <Minus size={12} className="text-slate-400" />;
  };

  const hasDisagreements = stats.disagreements.length > 0;

  // ── Threshold evaluation ──
  const thresholdWarnings = useMemo(() => {
    const warnings: { type: 'accuracy' | 'sample' | 'drift'; label: string; message: string }[] = [];
    if (!thresholds) return warnings;

    const { minAgreementRate, minVerifiedSampleSize, maxCategoryDriftShare } = thresholds;
    const sampleMet = stats.total >= minVerifiedSampleSize;

    // Only flag accuracy breach once minimum sample size is met
    if (sampleMet && stats.rate < minAgreementRate) {
      warnings.push({
        type: 'accuracy',
        label: 'Accuracy Threshold',
        message: `Rate (${stats.rate.toFixed(1)}%) below minimum (${minAgreementRate}%)`,
      });
    }

    // Flag if a single category dominates the drift share
    stats.categoryStats.forEach(cs => {
      if (sampleMet && cs.percentage > maxCategoryDriftShare) {
        warnings.push({
          type: 'drift',
          label: `${cs.category} Drift`,
          message: `${cs.category} accounts for ${cs.percentage.toFixed(0)}% of disagreements (max: ${maxCategoryDriftShare}%)`,
        });
      }
    });

    if (!sampleMet) {
      warnings.push({
        type: 'sample',
        label: 'Insufficient Data',
        message: `${stats.total} of ${minVerifiedSampleSize} minimum verified reports required for threshold evaluation`,
      });
    }

    return warnings;
  }, [thresholds, stats.rate, stats.total, stats.categoryStats]);

  const hasActiveWarning = thresholdWarnings.some(w => w.type === 'accuracy' || w.type === 'drift');

  return (
    <div className="space-y-6">
      {/* KPI Card */}
      <div className={`p-6 rounded-xl border relative ${getStatusColor(stats.rate)}`}>
        {/* Threshold warning pulse — only when sample size is met and a threshold is breached */}
        {hasActiveWarning && (
          <div className="absolute top-4 right-4">
            <span className="flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium opacity-80">AI Triage Accuracy</p>
            <h3 className="text-3xl font-bold mt-1">{stats.rate.toFixed(1)}%</h3>
          </div>
          <TrendingUp size={32} className="opacity-50" />
        </div>
        <p className="text-xs mt-4 opacity-70">
          Based on {stats.total} verified reports{hasDisagreements && <> &middot; {stats.disagreements.length} disagreements</>}.
        </p>
        {/* Threshold warnings strip */}
        {thresholdWarnings.length > 0 && (
          <div className="mt-3 pt-3 border-t border-current/10 space-y-1">
            {thresholdWarnings.map((w, i) => (
              <div key={i} className={`flex items-center gap-1.5 text-[11px] ${
                w.type === 'accuracy' ? 'text-rose-600' :
                w.type === 'drift' ? 'text-amber-600' :
                'text-slate-500'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  w.type === 'accuracy' ? 'bg-rose-500' :
                  w.type === 'drift' ? 'bg-amber-500' :
                  'bg-slate-400'
                }`} />
                <span className="font-medium">{w.label}:</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Category Breakdown Chart ── */}
      {hasDisagreements && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-900 text-sm">
            Disagreement Breakdown
          </div>
          <div className="p-4 space-y-3">
            {/* Stacked horizontal bar — composition view */}
            <div className="h-7 w-full bg-slate-100 rounded-full overflow-hidden flex cursor-pointer">
              {stats.categoryStats.map(cs => cs.count > 0 && (
                <div
                  key={cs.category}
                  onClick={() => toggleCategory(cs.category)}
                  title={`${CATEGORY_META[cs.category]?.label || cs.category}: ${cs.count} (${cs.percentage.toFixed(1)}%)`}
                  style={{ width: `${cs.percentage}%` }}
                  className={`${CATEGORY_META[cs.category]?.barColor || 'bg-slate-400'} h-full transition-all duration-200 first:rounded-l-full last:rounded-r-full ${
                    activeCategory && activeCategory !== cs.category ? 'opacity-30' : 'opacity-100'
                  } hover:opacity-80 cursor-pointer`}
                />
              ))}
            </div>

            {/* Per-category rows */}
            <div className="space-y-1.5">
              {stats.categoryStats.map(cs => {
                const meta = CATEGORY_META[cs.category] || CATEGORY_META.Other;
                const trend = stats.categoryTrends.find(t => t.category === cs.category);
                const isActive = activeCategory === cs.category;

                return (
                  <button
                    key={cs.category}
                    onClick={() => toggleCategory(cs.category)}
                    className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all text-left ${
                      isActive ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-slate-50'
                    } ${cs.count === 0 ? 'opacity-40' : ''}`}
                  >
                    {/* Color dot */}
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta.barColor}`} />

                    {/* Category label */}
                    <span className="text-xs font-medium text-slate-700 w-28 flex-shrink-0">{meta.label}</span>

                    {/* Mini bar */}
                    <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                      {cs.count > 0 && (
                        <div
                          className={`h-full rounded-full ${meta.barColor} transition-all`}
                          style={{ width: `${cs.percentage}%` }}
                        />
                      )}
                    </div>

                    {/* Count + percentage */}
                    <span className="text-xs font-mono font-bold text-slate-600 w-16 text-right flex-shrink-0">
                      {cs.count} <span className="text-slate-400 font-normal">({cs.percentage.toFixed(0)}%)</span>
                    </span>

                    {/* Trend indicator */}
                    {trend && cs.count > 0 && (
                      <span className="flex items-center gap-0.5 w-12 flex-shrink-0 justify-end" title={
                        trend.trend === 'up' ? `Increased from ${trend.prior} to ${trend.recent}` :
                        trend.trend === 'down' ? `Decreased from ${trend.prior} to ${trend.recent}` :
                        'Stable'
                      }>
                        {getTrendIcon(trend.trend)}
                        <span className="text-[10px] text-slate-400 font-mono">{trend.recent}/{trend.prior}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Recent Disagreements Table ── */}
      {filteredDisagreements.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="font-semibold text-slate-900 text-sm">
              {activeCategory
                ? `Overrides — ${CATEGORY_META[activeCategory]?.label || activeCategory}`
                : 'Recent Overrides'}
            </span>
            {activeCategory && (
              <button
                onClick={() => setActiveCategory(null)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <X size={12} /> Clear filter
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Patient</th>
                <th className="px-4 py-2 text-left">Override</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDisagreements.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.patientName}</td>
                  <td className="px-4 py-3 text-indigo-600 font-medium">{r.clinicianTriageOverride}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      CATEGORY_META[r.disagreementCategory || 'Other']?.badgeColor || 'bg-slate-50 text-slate-500'
                    }`}>
                      {CATEGORY_META[r.disagreementCategory || 'Other']?.label || 'Other'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 italic truncate max-w-[120px]">{r.reviewNote || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeCategory && stats.disagreements.length > 5 && (
            <div className="px-4 py-2 border-t border-slate-100 text-center text-[11px] text-slate-400">
              Showing up to 5 most recent &middot; {stats.disagreements.filter(r => (r.disagreementCategory || 'Other') === activeCategory).length} total
            </div>
          )}
        </div>
      )}

      {/* No-disagreements state */}
      {!hasDisagreements && stats.total > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <CheckCircle size={32} className="mx-auto text-emerald-400 mb-2" />
          <p className="text-sm font-medium text-slate-600">No disagreements</p>
          <p className="text-xs text-slate-400 mt-1">All {stats.total} verified reports agree with the AI.</p>
        </div>
      )}

      {/* No-data state */}
      {stats.total === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
          <AlertCircle size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-medium text-slate-500">No verified reports yet</p>
          <p className="text-xs text-slate-400 mt-1">Accuracy data will appear once clinicians review cases in the Triage Queue.</p>
        </div>
      )}
    </div>
  );
}
