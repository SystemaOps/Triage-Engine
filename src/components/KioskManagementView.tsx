import React, { useEffect, useState, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { HardDrive, Activity, AlertTriangle, CheckCircle, Server } from 'lucide-react';
import { api } from '../lib/api';
import { KioskTerminal } from '../types';

export const KioskManagementView: React.FC = () => {
  const [kiosks, setKiosks] = useState<KioskTerminal[]>([]);
  const [loading, setLoading] = useState(true);

  // Re-establish the live Firestore subscription
  useEffect(() => {
    const unsubscribe = api.kiosks.subscribeToKiosks?.((liveData) => {
      setKiosks(liveData);
      setLoading(false);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  // Compute live metrics dynamically
  const metrics = useMemo(() => {
    const total = kiosks.length;
    const online = kiosks.filter(k => k.status === 'online').length;
    const offline = kiosks.filter(k => k.status === 'offline' || k.status === 'error').length;
    return { total, online, offline };
  }, [kiosks]);

  // Transform live kiosks into a rough simulated time-series for the chart
  const connectivityTrend = useMemo(() => {
    const base = metrics.online;
    return [
      { time: 'T-60m', active: Math.max(0, base - 2) },
      { time: 'T-45m', active: Math.max(0, base - 1) },
      { time: 'T-30m', active: Math.max(0, base - 1) },
      { time: 'T-15m', active: base },
      { time: 'Live', active: base },
    ];
  }, [metrics.online]);

  const [chartMounted, setChartMounted] = useState(false);
  useEffect(() => { setChartMounted(true); }, []);

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center font-mono text-xs text-indigo-400 animate-pulse tracking-widest">
        ESTABLISHING SECURE EDGE TERMINAL UPLINK...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans selection:bg-indigo-500/30 animate-fade-in">
      {/* Upper Metrics Layer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-slate-500" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Kiosks</p>
              <h3 className="text-3xl font-bold tracking-tight mt-1 text-white">{metrics.total}</h3>
            </div>
            <div className="p-2 bg-slate-800/50 rounded-lg text-slate-400"><HardDrive size={18} /></div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Online & Nominal</p>
              <h3 className="text-3xl font-bold tracking-tight mt-1 text-white">{metrics.online}</h3>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><Activity size={18} /></div>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 backdrop-blur-md relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Offline / Fault</p>
              <h3 className="text-3xl font-bold tracking-tight mt-1 text-white">{metrics.offline}</h3>
            </div>
            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400"><AlertTriangle size={18} /></div>
          </div>
        </div>
      </div>

      {/* Main Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Connectivity Trends */}
        <div className="lg:col-span-7 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white tracking-tight mb-6">Kiosk Connectivity Trends</h2>
          <div className="h-64 w-full font-mono text-xs min-w-0">
            {chartMounted && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={connectivityTrend}>
                  <defs>
                    <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" stroke="#475569" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="#475569" tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f1f5f9', borderRadius: '8px' }} 
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Area type="monotone" dataKey="active" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorActive)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right Column: Live Terminal Alert Matrix */}
        <div className="lg:col-span-5 bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 backdrop-blur-xl flex flex-col">
          <h2 className="text-lg font-bold text-white tracking-tight mb-4">Live Edge Alerts</h2>
          <div className="flex-1 space-y-3 overflow-y-auto max-h-[300px] pr-2">
            {metrics.offline === 0 ? (
               <div className="h-full flex flex-col items-center justify-center text-center p-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                 <CheckCircle className="text-emerald-500/50 mb-2" size={24} />
                 <span className="text-xs font-mono font-bold text-slate-500 tracking-widest">NETWORK STABLE</span>
               </div>
            ) : (
              kiosks.filter(k => k.status === 'offline' || k.status === 'error').map(k => (
                <div key={k.id} className="p-4 border border-rose-900/50 bg-rose-950/20 rounded-xl flex items-start gap-3">
                  <div className="mt-0.5 text-rose-500 animate-pulse"><Server size={16} /></div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">{k.name || `Terminal ${k.id.substring(0,6)}`}</h4>
                    <p className="text-xs text-slate-400 mt-1">Heartbeat lost. Requires manual restart or network diagnostics at location: {k.locationId || 'Unknown'}.</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default KioskManagementView;
