import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { Role, AppNotification, SubsystemHealth } from '../types';
import { Smartphone, Wifi, Activity, Bell, Database, Users, Signal, RefreshCw, ArrowUp, ArrowDown, Minus, Clock, Globe, CheckCircle, AlertTriangle, BarChart3, Loader2 } from 'lucide-react';

interface MobileInterfacesViewProps {
  userRole: Role;
}

interface ExternalServiceHealth {
  id: string;
  name: string;
  type: 'core_service' | 'ai_model' | 'kiosk_hardware';
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  latencyMs: number | null;
  lastSeen: string;
  errorMessage: string | null;
  detail?: Record<string, unknown>;
}

interface ExternalHealthReport {
  success: boolean;
  timestamp: string;
  overallStatus: string;
  services: ExternalServiceHealth[];
}

export default function MobileInterfacesView({ userRole }: MobileInterfacesViewProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [externalHealth, setExternalHealth] = useState<ExternalHealthReport | null>(null);
  const [externalHealthError, setExternalHealthError] = useState<string | null>(null);

  // ── Fetch external services health (proxy for mobile API health) ──
  const fetchExternalHealth = async () => {
    try {
      const baseUrl = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:5001';
      const apiKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const response = await fetch(`${baseUrl}/api/external-services/health`, {
        method: 'GET',
        headers,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setExternalHealth(data);
      setExternalHealthError(null);
    } catch (err) {
      setExternalHealthError(err instanceof Error ? err.message : 'Failed to fetch external health');
      setExternalHealth(null);
    }
  };

  // ── Refresh health on demand ──
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchExternalHealth();
    setRefreshing(false);
  };

  // ── Load notifications for push stats ──
  useEffect(() => {
    api.notifications.getAll().then(setNotifications).catch(() => {});
    fetchExternalHealth();
    const interval = setInterval(fetchExternalHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // ── Derived stats ──
  const pushStats = useMemo(() => {
    const total = notifications.length;
    const unacknowledged = notifications.filter(n => !n.acknowledged).length;
    const critical = notifications.filter(n => n.severity === 'critical').length;
    const clinical = notifications.filter(n => n.category === 'clinical').length;
    const deviceAlerts = notifications.filter(n => n.category === 'device').length;
    return { total, unacknowledged, critical, clinical, deviceAlerts };
  }, [notifications]);

  const apiHealthStats = useMemo(() => {
    if (!externalHealth?.services) return null;
    const services = externalHealth.services;
    return {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      degraded: services.filter(s => s.status === 'degraded').length,
      critical: services.filter(s => s.status === 'critical').length,
      avgLatency: services.length > 0
        ? Math.round(services.reduce((sum, s) => sum + (s.latencyMs ?? 0), 0) / services.length)
        : 0,
    };
  }, [externalHealth]);

  const statusDot = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-500';
      case 'degraded': return 'bg-amber-500';
      case 'critical': return 'bg-rose-500';
      default: return 'bg-slate-400';
    }
  };

  const statusBg = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-50 border-emerald-200';
      case 'degraded': return 'bg-amber-50 border-amber-200';
      case 'critical': return 'bg-rose-50 border-rose-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  const statusText = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-emerald-700';
      case 'degraded': return 'text-amber-700';
      case 'critical': return 'text-rose-700';
      default: return 'text-slate-500';
    }
  };

  const formatLatency = (ms: number | null) => {
    if (ms === null) return '—';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Smartphone size={24} className="text-indigo-500" />
            Mobile Interfaces
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Mobile app connection telemetry, push notification status, and external API health for partner applications.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Refreshing...' : 'Refresh Health'}
        </button>
      </div>

      {/* ── KPI Metrics Strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">API Services</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {apiHealthStats?.total ?? '—'}
              </h3>
            </div>
            <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Globe size={18} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            {apiHealthStats ? `${apiHealthStats.healthy} healthy · ${apiHealthStats.degraded} degraded` : 'Loading...'}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Avg Latency</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {apiHealthStats ? formatLatency(apiHealthStats.avgLatency) : '—'}
              </h3>
            </div>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Signal size={18} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">Across all services</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Notifications</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{pushStats.total}</h3>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Bell size={18} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">
            {pushStats.unacknowledged} unread · {pushStats.critical} critical
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Active Sessions</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">—</h3>
            </div>
            <div className="w-9 h-9 rounded-lg bg-cyan-50 text-cyan-600 flex items-center justify-center">
              <Users size={18} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">Requires mobile SDK integration</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Push Channel</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">—</h3>
            </div>
            <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Wifi size={18} />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 font-mono">FCM not yet configured</p>
        </div>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* ── Left: External Service Health ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Database size={16} className="text-indigo-500" />
            <span className="text-sm font-bold text-slate-900">External API Health</span>
            {externalHealth && (
              <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                externalHealth.overallStatus === 'healthy'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : externalHealth.overallStatus === 'degraded'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                {externalHealth.overallStatus.toUpperCase()}
              </span>
            )}
          </div>
          <div className="p-5 space-y-3">
            {externalHealthError && (
              <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <AlertTriangle size={14} className="text-rose-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-rose-700">Connection Error</p>
                  <p className="text-[10px] text-rose-600 font-mono mt-0.5">{externalHealthError}</p>
                  <button onClick={handleRefresh} className="mt-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-700">
                    Retry connection
                  </button>
                </div>
              </div>
            )}

            {externalHealth?.services.map((svc) => (
              <div
                key={svc.id}
                className={`flex items-center justify-between p-3 rounded-xl border ${statusBg(svc.status)}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(svc.status)}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{svc.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate">{svc.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-[10px] font-semibold ${statusText(svc.status)}`}>
                    {svc.status.charAt(0).toUpperCase() + svc.status.slice(1)}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 w-16 text-right">
                    {formatLatency(svc.latencyMs)}
                  </span>
                </div>
              </div>
            ))}

            {!externalHealth && !externalHealthError && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Loader2 size={20} className="animate-spin mb-2 text-indigo-500" />
                <p className="text-xs font-mono">Checking external service health...</p>
              </div>
            )}

            {externalHealth && externalHealth.services.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                <Database size={24} className="mb-2 opacity-50" />
                <p className="text-xs font-medium">No services reported</p>
              </div>
            )}
          </div>
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-mono">
            <span>Last checked: {externalHealth ? new Date(externalHealth.timestamp).toLocaleTimeString() : '—'}</span>
            <span>Auto-refresh every 30s</span>
          </div>
        </div>

        {/* ── Right: Push Notification Stats ── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Bell size={16} className="text-amber-500" />
            <span className="text-sm font-bold text-slate-900">Push Notification Channel</span>
          </div>
          <div className="p-5 space-y-5">
            {/* Notification counts */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                <p className="text-2xl font-bold text-slate-900">{pushStats.total}</p>
                <p className="text-[10px] font-medium text-slate-500 mt-0.5">Total</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                <p className="text-2xl font-bold text-amber-600">{pushStats.unacknowledged}</p>
                <p className="text-[10px] font-medium text-slate-500 mt-0.5">Unread</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-200">
                <p className="text-2xl font-bold text-rose-600">{pushStats.critical}</p>
                <p className="text-[10px] font-medium text-slate-500 mt-0.5">Critical</p>
              </div>
            </div>

            {/* Notification category breakdown */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">By Category</p>
              {[
                { label: 'Clinical', count: pushStats.clinical, color: 'bg-blue-500' },
                { label: 'Device', count: pushStats.deviceAlerts, color: 'bg-amber-500' },
                { label: 'AI', count: notifications.filter(n => n.category === 'ai').length, color: 'bg-purple-500' },
                { label: 'Security', count: notifications.filter(n => n.category === 'security').length, color: 'bg-rose-500' },
              ].map((item) => {
                const max = Math.max(pushStats.total, 1);
                return (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="w-16 text-[10px] font-medium text-slate-600">{item.label}</span>
                    <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all`}
                        style={{ width: `${(item.count / max) * 100}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-600 w-8 text-right">{item.count}</span>
                  </div>
                );
              })}
            </div>

            {/* FCM setup notice */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle size={16} className="text-indigo-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-indigo-800">Firebase Cloud Messaging</p>
                <p className="text-[10px] text-indigo-600 mt-0.5">
                  Push notifications are stored in Firestore but not yet sent to mobile devices.
                  Integrate FCM to deliver real-time push alerts to Android and iOS apps.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Recent Notifications Feed ── */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-slate-400" />
            <span className="text-sm font-bold text-slate-900">Recent Notifications Feed</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">{pushStats.total} total</span>
        </div>
        <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-slate-400">
              <Bell size={24} className="mb-2 opacity-50" />
              <p className="text-xs font-medium">No notifications yet</p>
            </div>
          ) : (
            notifications.slice(0, 15).map((n) => (
              <div key={n.id} className="px-5 py-3 hover:bg-slate-50 transition-colors flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                  n.severity === 'critical' ? 'bg-rose-500' :
                  n.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                      n.category === 'clinical' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      n.category === 'device' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      n.category === 'ai' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {n.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{n.message}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!n.acknowledged && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unacknowledged" />
                  )}
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Integration Status Terminal ── */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="font-mono text-sm">
            <span className="text-cyan-400">$</span>{' '}
            <span className="text-emerald-400">mobile-interfaces</span>{' '}
            <span className="text-slate-500">~ integration-status</span>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
            externalHealth?.overallStatus === 'healthy'
              ? 'bg-emerald-900 text-emerald-200 animate-pulse'
              : 'bg-slate-800 text-slate-500'
          }`}>
            {externalHealth ? 'API CONNECTED' : 'AWAITING CONNECTION'}
          </span>
        </div>
        <div className="font-mono text-xs text-slate-400 space-y-1">
          <div className="text-slate-500"># Mobile Interface Integration Status</div>
          <div>api_gateway: <span className={externalHealth ? 'text-emerald-400' : 'text-slate-600'}>
            {externalHealth ? 'CONNECTED' : 'NOT CONNECTED'}
          </span></div>
          <div>firestore_sync: <span className="text-emerald-400">ACTIVE</span></div>
          <div>push_notifications: <span className="text-slate-600">PENDING (FCM setup required)</span></div>
          <div>active_mobile_clients: <span className="text-slate-600">0 (SDK not yet deployed)</span></div>
          <div className="text-slate-600 mt-2">
            # Mobile app can read: analytics, notifications, patient status via Firestore SDK
          </div>
          <div className="text-slate-600">
            # Kiosk can write: patient records, kiosk heartbeats via Firestore SDK
          </div>
        </div>
      </div>
    </div>
  );
}
