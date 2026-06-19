import React, { useState, useEffect, useMemo } from 'react';
import { PageHeader } from './common/PageHeader';
import { Card } from './common/Card';
import { api } from '../lib/api';
import { TriageAnalyticsSnapshot, Role } from '../types';
import { Clock } from 'lucide-react';

/**
 * Displays how many minutes have elapsed since the snapshot was computed.
 * Returns null if computedAt is not available (live aggregation fallback).
 */
function useStalenessMinutes(computedAt: string | undefined | null): number | null {
  return useMemo(() => {
    if (!computedAt) return null;
    const elapsed = Date.now() - new Date(computedAt).getTime();
    return Math.floor(elapsed / 60000);
  }, [computedAt]);
}

export default function AnalyticsDashboardView({ userRole }: { userRole: Role }) {
  const [snapshot, setSnapshot] = useState<TriageAnalyticsSnapshot | null>(null);
  const stalenessMinutes = useStalenessMinutes(snapshot?.computedAt);

  useEffect(() => {
    api.analytics.getSnapshot('2026-W23').then(setSnapshot);
  }, []);

  if (!snapshot) return <div>Loading...</div>;

  const accuracyRate =
    snapshot.aiAccuracyMetrics.totalInferences > 0
      ? ((snapshot.aiAccuracyMetrics.doctorAgreements / snapshot.aiAccuracyMetrics.totalInferences) * 100).toFixed(1)
      : '—';

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics & Clinical Intelligence" />

      {/* Staleness indicator banner */}
      {stalenessMinutes !== null && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
          <Clock size={14} className="text-slate-400" />
          <span>
            Data aggregated by background compute job{' '}
            <span className="font-semibold text-slate-600">
              {stalenessMinutes < 1
                ? 'less than a minute ago'
                : stalenessMinutes < 60
                  ? `${stalenessMinutes} minute${stalenessMinutes === 1 ? '' : 's'} ago`
                  : `${Math.floor(stalenessMinutes / 60)} hour${Math.floor(stalenessMinutes / 60) === 1 ? '' : 's'} ago`}
            </span>
            . Refreshes every 15 minutes. Live-updating charts below may show more recent data.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900">Clinical & AI Insights</h3>
          <p className="mt-2 text-gray-600">Accuracy: {accuracyRate}%</p>
          <p className="text-gray-600">Total overrules: {snapshot.aiAccuracyMetrics.doctorOverrules}</p>
          <p className="text-gray-600 text-xs mt-2">
            Inferences: {snapshot.aiAccuracyMetrics.totalInferences}
          </p>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900">Throughput</h3>
          <p className="mt-2 text-gray-600">Total sessions: {snapshot.totalTriageSessions}</p>
          <p className="text-gray-600">Average wait time: {snapshot.averageWaitTimeSec / 60} minutes</p>
          {snapshot.kioskUptimeRate !== undefined && (
            <p className="text-gray-600 text-xs mt-2">Kiosk uptime: {snapshot.kioskUptimeRate}%</p>
          )}
        </Card>
      </div>
    </div>
  );
}
