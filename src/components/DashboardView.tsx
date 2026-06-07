import { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Activity, Wifi, Brain, Clock } from 'lucide-react';
import { analyticsService } from '../lib/api';
import { Role } from '../types';

interface DashboardMetrics {
  activeTriageCount: number;
  modelConsensusRate: number;
  kioskUptimeRate: number;
  averageVelocityMinutes: number;
}

interface AlertEntry {
  id: string;
  type: 'critical' | 'warning' | 'info';
  source: string;
  message: string;
  timestamp: string;
}
export default function DashboardView({ userRole }: { userRole: Role }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [chartData, setChartData] = useState<Array<{ hour: string; count: number }>>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function hydrateDashboard() {
      try {
        const snapshot = await analyticsService.getSnapshot();
        setMetrics(snapshot.metrics);
        setChartData(snapshot.volumeChartData);
        setAlerts(snapshot.actionableAlerts);
      } catch (error) {
        console.error('Failed to hydrate telemetry:', error);
      } finally {
        setLoading(false);
      }
    }

    hydrateDashboard();
    const interval = setInterval(hydrateDashboard, 5000);
    return () => clearInterval(interval);
  }, []);

  const [chartMounted, setChartMounted] = useState(false);
  useEffect(() => { setChartMounted(true); }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center font-mono text-xs text-slate-500 animate-pulse tracking-[0.3em]">
        INITIALIZING OPERATIONAL TACTICAL COMMAND DISPLAY...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans selection:bg-indigo-500/30">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">
            Clinical Enterprise Control Plane
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time multi-agent consensus metrics, kiosk status matrices, and active human-in-the-loop triage streams.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs bg-slate-900/60 border border-slate-800/80 px-4 py-2 rounded-full text-slate-300 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span>System Scope: {userRole.toUpperCase()}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <div className="flex justify-between items-start relative">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Triage Pool</p>
              <h3 className="text-3xl font-bold tracking-tight mt-1 text-white">{metrics?.activeTriageCount ?? 0}</h3>
              <span className="text-xs font-semibold text-emerald-400 mt-1 inline-block">In-Flight</span>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><Activity size={18} /></div>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
          <div className="flex justify-between items-start relative">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Model Consensus</p>
              <h3 className="text-3xl font-bold tracking-tight mt-1 text-white">{metrics?.modelConsensusRate ?? 0}%</h3>
              <span className="text-xs font-semibold text-indigo-400 mt-1 inline-block">Verified</span>
            </div>
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400"><Brain size={18} /></div>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
          <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500" />
          <div className="flex justify-between items-start relative">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Edge Heartbeat</p>
              <h3 className="text-3xl font-bold tracking-tight mt-1 text-white">{metrics?.kioskUptimeRate ?? 100}%</h3>
              <span className="text-xs font-semibold text-cyan-400 mt-1 inline-block">Nominal</span>
            </div>
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400"><Wifi size={18} /></div>
          </div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md relative overflow-hidden group hover:border-slate-700 transition-all duration-300">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <div className="flex justify-between items-start relative">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Mean Velocity</p>
              <h3 className="text-3xl font-bold tracking-tight mt-1 text-white">{metrics?.averageVelocityMinutes ?? 0}m</h3>
              <span className="text-xs font-semibold text-amber-400 mt-1 inline-block">Per Patient</span>
            </div>
            <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400"><Clock size={18} /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-12 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
            <h3 className="text-sm font-bold text-white tracking-tight uppercase tracking-wider">Triage Volume — Last 24 Hours</h3>
          </div>
          <div className="h-48 w-full min-w-0">
            {chartMounted && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="hour" stroke="#475569" tickLine={false} axisLine={false} style={{ fontSize: '10px', fontFamily: 'monospace' }} />
                  <YAxis stroke="#475569" tickLine={false} axisLine={false} style={{ fontSize: '10px', fontFamily: 'monospace' }} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9', borderRadius: '12px' }} />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
