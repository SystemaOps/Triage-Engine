import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { DiagnosticReport, Role, RetrainThresholds } from '../types';
import DriftMonitor from '../components/analytics/DriftMonitor';
import { BrainCircuit, Activity, FileText, CheckCircle } from 'lucide-react';

export default function CommandCenter({ userRole }: { userRole: Role }) {
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [thresholds, setThresholds] = useState<RetrainThresholds | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = api.reports.subscribeToReports((data) => {
      setReports(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Fetch retrain threshold settings from Firestore
  useEffect(() => {
    api.settings.get().then(settings => {
      setThresholds(settings.aiConfig.retrainThresholds);
    }).catch(err => {
      console.error('Failed to load threshold settings:', err);
    });
  }, []);

  const verifiedCount = reports.filter(r => r.status === 'verified').length;
  const pendingCount = reports.filter(r => r.status === 'pending').length;
  const flaggedCount = reports.filter(r => r.status === 'flagged').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400 font-mono text-sm animate-pulse">
        LOADING COMMAND CENTER...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Command Center</h1>
        <p className="text-sm text-slate-500 mt-1">
          Real-time overview of triage processing, AI accuracy, and infrastructure health.
        </p>
      </div>

      {/* Operations Metrics Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Reports</p>
              <h3 className="text-3xl font-bold text-slate-900">{reports.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
              <FileText size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-slate-600">
            <span>Across all categories</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Verified</p>
              <h3 className="text-3xl font-bold text-emerald-600">{verifiedCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-emerald-600">
            <span>Clinician-reviewed</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Pending Review</p>
              <h3 className="text-3xl font-bold text-amber-600">{pendingCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <Activity size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-amber-600">
            <span>Awaiting verification</span>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Flagged</p>
              <h3 className="text-3xl font-bold text-rose-600">{flaggedCount}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
              <BrainCircuit size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center text-sm font-medium text-rose-600">
            <span>Requires attention</span>
          </div>
        </div>
      </div>

      {/* Drift Monitor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <DriftMonitor reports={reports} thresholds={thresholds || undefined} />
        </div>
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-center text-slate-400 text-sm">
          <div className="text-center">
            <Activity size={40} className="mx-auto text-slate-200 mb-3" />
            <p className="font-medium">Triage Volume Chart</p>
            <p className="text-xs text-slate-400 mt-1">Visualization area for incoming report trends.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
