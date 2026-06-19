import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from './common/PageHeader';
import { Card } from './common/Card';
import { api } from '../lib/api';
import { Role, SubsystemHealth } from '../types';

const statusConfig = {
  healthy: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Online' },
  degraded: { dot: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', label: 'Degraded' },
  critical: { dot: 'bg-rose-500', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', label: 'Critical' },
  unknown: { dot: 'bg-slate-400', bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-500', label: 'Unknown' },
};

export default function SystemHealthDashboardView({ userRole }: { userRole: Role }) {
  const [services, setServices] = useState<SubsystemHealth[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  // Track previous statuses via ref to avoid side-effects inside state updater
  const prevStatusesRef = useRef<Map<string, SubsystemHealth['status']>>(new Map());

  useEffect(() => {
    const unsub = api.health.subscribe((healthData) => {
      setServices(healthData);

      // Detect status changes in a separate, side-effect-safe block
      const changed = healthData.filter(s => {
        const prev = prevStatusesRef.current.get(s.id);
        return prev !== undefined && prev !== s.status;
      });
      changed.forEach(s => {
        const ts = new Date().toLocaleTimeString();
        const cfg = statusConfig[s.status];
        setLogs(prevLogs => [`[${ts}] ${s.name} → ${cfg.label}`, ...prevLogs.slice(0, 29)]);
      });

      // Update ref for next comparison
      const newMap = new Map(prevStatusesRef.current);
      healthData.forEach(s => newMap.set(s.id, s.status));
      prevStatusesRef.current = newMap;
    });
    return () => unsub();
  }, []);

  const onlineCount = services.filter(s => s.status === 'healthy').length;
  const degradedCount = services.filter(s => s.status === 'degraded').length;
  const offlineCount = services.filter(s => s.status === 'critical').length;
  const totalCount = services.length;

  // Compute aggregate metrics from live data
  const avgLatency = services.length > 0
    ? Math.round(services.reduce((acc, s) => acc + (s.latencyMs ?? 0), 0) / services.length)
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="System Telemetry & Unified Health Deck" />

      <div className="text-sm text-slate-600 mb-4">
        Real-time health status across all infrastructure, AI, and edge subsystems — consolidated Unified Triage API replaces individual OCR, Visual, and X-Ray entries.{' '}
        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{services.length} services tracked</span>
      </div>

      {/* Top Tier: Infrastructure Hardware Vitals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-wider text-slate-600">Subsystem Health</h3>
              <span className={`text-xs font-semibold ${offlineCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {offlineCount > 0 ? `${offlineCount} Critical` : 'All Nominal'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-900">{totalCount > 0 ? Math.round((onlineCount / totalCount) * 100) : 0}%</span>
              <span className="text-sm text-slate-500">Uptime Rate</span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${offlineCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                style={{ width: `${totalCount > 0 ? (onlineCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-wider text-slate-600">Avg Response Latency</h3>
              <span className={`text-xs font-semibold ${avgLatency > 100 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {avgLatency > 100 ? 'Elevated' : 'Nominal'}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-900">{avgLatency}ms</span>
              <span className="text-sm text-slate-500">across {totalCount} nodes</span>
            </div>
            <p className="text-xs text-slate-500">Aggregated from live Firestore health documents (Unified Triage API consolidates LLM + RAG + Vision/OCR).</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm uppercase tracking-wider text-slate-600">Service Distribution</h3>
              <span className="text-xs font-semibold text-slate-600">{totalCount} Total</span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> {onlineCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> {degradedCount}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" /> {offlineCount}
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500">Real-time subsystem status — STT kept separate (no unified equivalent).</p>
          </div>
        </Card>
      </div>

      {/* Middle Tier: Subsystem Node Grid */}
      <Card className="p-6 space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-slate-900">Subsystem Node Matrix</h3>
          <p className="text-sm text-slate-600">Live topology of all registered infrastructure, AI, and edge components. <span className="text-xs text-slate-400 font-mono">Unified Triage API covers LLM/RAG + OCR + Visual + X-Ray.</span></p>
        </div>

        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="font-medium text-slate-700">{onlineCount} Healthy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="font-medium text-slate-700">{degradedCount} Degraded</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="font-medium text-slate-700">{offlineCount} Critical</span>
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mt-6">
          {services.length === 0 ? (
            <div className="col-span-full text-center py-8 text-sm text-slate-400 font-mono">
              No subsystem data available. Seed the systemHealth collection to populate the matrix.
            </div>
          ) : (
            services.map((svc) => {
              const cfg = statusConfig[svc.status];
              return (
                <div
                  key={svc.id}
                  className={`rounded-2xl border p-4 space-y-2 text-center transition ${cfg.bg} ${cfg.border}`}
                >
                  <div className="text-xs font-semibold text-slate-700 truncate" title={svc.name}>
                    {svc.name}
                  </div>
                  <div className={`w-2.5 h-2.5 rounded-full mx-auto ${cfg.dot}`} />
                  <div className="text-xs text-slate-600">{svc.latencyMs ?? '—'}ms</div>
                  <div className="text-[10px] text-slate-500 capitalize">{svc.type?.replace('_', ' ') || '—'}</div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Bottom Tier: Live Ingestion Log Terminal */}
      <Card className="p-6 space-y-4 bg-slate-950 text-slate-100 border-slate-800">
        <div className="flex items-center justify-between">
          <div className="font-mono text-sm">
            <span className="text-cyan-400">$</span> <span className="text-emerald-400">live-subsystem-log</span>{' '}
            <span className="text-slate-500">~ health-status-events</span>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${services.length > 0 ? 'bg-emerald-900 text-emerald-200 animate-pulse' : 'bg-slate-800 text-slate-500'}`}>
            {services.length > 0 ? 'STREAMING' : 'AWAITING DATA'}
          </span>
        </div>

        <div className="border-t border-slate-800 pt-4 space-y-1 font-mono text-xs h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-slate-500">Listening for live subsystem state transitions...</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="text-slate-400">
                {log}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
