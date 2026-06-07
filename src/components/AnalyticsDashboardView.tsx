import React, { useState, useEffect } from 'react';
import { PageHeader } from './common/PageHeader';
import { Card } from './common/Card';
import { api } from '../lib/api';
import { TriageAnalyticsSnapshot, Role } from '../types';

export default function AnalyticsDashboardView({ userRole }: { userRole: Role }) {
  const [snapshot, setSnapshot] = useState<TriageAnalyticsSnapshot | null>(null);

  useEffect(() => {
    api.analytics.getSnapshot('2026-W23').then(setSnapshot);
  }, []);

  if (!snapshot) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics & Clinical Intelligence" />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900">Clinical & AI Insights</h3>
          <p className="mt-2 text-gray-600">Accuracy: {((snapshot.aiAccuracyMetrics.doctorAgreements / snapshot.aiAccuracyMetrics.totalInferences) * 100).toFixed(1)}%</p>
          <p className="text-gray-600">Total overrules: {snapshot.aiAccuracyMetrics.doctorOverrules}</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900">Throughput</h3>
          <p className="mt-2 text-gray-600">Total sessions: {snapshot.totalTriageSessions}</p>
          <p className="text-gray-600">Average wait time: {snapshot.averageWaitTimeSec / 60} minutes</p>
        </Card>
      </div>
    </div>
  );
}
