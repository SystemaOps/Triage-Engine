import React, { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Role } from '../types';

export default function DebugChaosDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFlooding, setIsFlooding] = useState(false);
  const floodIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (floodIntervalRef.current) {
        clearInterval(floodIntervalRef.current);
      }
    };
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  // ── Profile 1: Kiosk Outage Injection ──
  const triggerKioskOutage = useCallback(async () => {
    addLog('⚡ CHAOS: Scanning for active edge terminals...');
    try {
      const kiosks = await api.kiosks.getAll();
      if (kiosks.length === 0) {
        addLog('⚠️ No kiosks found — seed database first');
        return;
      }

      const target = kiosks[Math.floor(Math.random() * kiosks.length)];
      const originalStatus = target.status;

      addLog(`💥 Forcing connection drop on Terminal: ${target.id} (${target.name})`);
      await api.kiosks.updateKioskStatus(target.id, 'offline', 'chaos-monkey');

      addLog(`⏳ Auto-recovery scheduled in 8s for: ${target.id}`);
      setTimeout(async () => {
        try {
          addLog(`🔄 Restoring heartbeat to Terminal: ${target.id} → ${originalStatus}`);
          await api.kiosks.updateKioskStatus(target.id, originalStatus, 'chaos-monkey');
          addLog(`✅ Terminal ${target.id} heartbeat restored`);
        } catch (err) {
          addLog(`❌ Recovery failed for ${target.id}: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }, 8000);
    } catch (err) {
      addLog(`❌ Kiosk outage injection failed: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }, [addLog]);

  // ── Profile 2: High-Volume Triage Flood ──
  const toggleTriageFlood = useCallback(() => {
    if (isFlooding) {
      if (floodIntervalRef.current) {
        clearInterval(floodIntervalRef.current);
        floodIntervalRef.current = null;
      }
      setIsFlooding(false);
      addLog('🛑 Triage flood terminated');
      return;
    }

    setIsFlooding(true);
    addLog('🌊 Initiating high-velocity triage ingestion stream...');

    let counter = 0;
    floodIntervalRef.current = setInterval(async () => {
      counter++;
      const randomId = `mock-pt-${Date.now()}-${counter}`;
      const statuses: Array<'Registered' | 'In Triage' | 'Needs Review'> = ['Registered', 'In Triage', 'Needs Review'];
      const triageOptions: Array<'Self-care' | 'Doctor' | 'Urgent' | 'Emergency'> = ['Self-care', 'Doctor', 'Urgent', 'Emergency'];

      try {
        const patientId = await api.patients.create(
          {
            patientName: `Simulated Alpha ${randomId.substring(8, 16)}`,
            triageCategory: triageOptions[Math.floor(Math.random() * triageOptions.length)],
            confidence: 0.75 + Math.random() * 0.2,
            timestamp: new Date().toISOString(),
            status: statuses[Math.floor(Math.random() * statuses.length)],
            traceEvents: [],
          },
          'chaos-monkey',
          'admin' as Role,
        );
        addLog(`📦 Ingested patient ${patientId.substring(0, 10)}...`);
      } catch (err) {
        addLog(`❌ Ingestion dropped frame: ${err instanceof Error ? err.message : 'Unknown'}`);
      }
    }, 1500);
  }, [isFlooding, addLog]);

  // ── Trigger Button (collapsed state) ──
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-mono text-[11px] font-bold uppercase tracking-wider rounded-xl shadow-lg transition-transform hover:scale-105"
      >
        ⚠️ Open Chaos Panel
      </button>
    );
  }

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-slate-900 text-slate-100 shadow-2xl z-50 border-l border-slate-800 flex flex-col font-mono text-xs">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950">
        <span className="font-bold text-rose-500 tracking-wider">⚡ SIMULATION CONTROL</span>
        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white font-bold text-sm">
          ✕
        </button>
      </div>

      {/* Profiles */}
      <div className="p-4 space-y-5 flex-shrink-0">
        {/* Profile 1: Kiosk Outage */}
        <div>
          <h4 className="text-slate-400 font-bold mb-2 text-[10px] uppercase tracking-wider">
            Edge Layer Distortions
          </h4>
          <button
            onClick={triggerKioskOutage}
            className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-left p-2.5 rounded-xl transition-all"
          >
            💥 Drop Random Kiosk Offline
            <p className="text-[10px] text-slate-500 mt-1 font-sans">
              Forces a target edge device to offline state. Spawns an auto-recovery routine in 8s.
            </p>
          </button>
        </div>

        {/* Profile 2: Triage Flood */}
        <div>
          <h4 className="text-slate-400 font-bold mb-2 text-[10px] uppercase tracking-wider">
            Concurrency Engine Loads
          </h4>
          <button
            onClick={toggleTriageFlood}
            className={`w-full border text-left p-2.5 rounded-xl transition-all ${
              isFlooding
                ? 'bg-rose-950 border-rose-500 text-rose-200'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            {isFlooding ? '🛑 Terminate Triage Flood' : '🌊 Ingest High-Velocity Influx'}
            <p className="text-[10px] opacity-70 mt-1 font-sans">
              Streams rapid telemetry payloads into Firestore to test transaction lock isolation levels.
            </p>
          </button>
        </div>
      </div>

      {/* Console Log */}
      <div className="flex-1 border-t border-slate-800 overflow-hidden flex flex-col">
        <div className="px-4 py-2 bg-slate-950 text-[10px] text-slate-500 border-b border-slate-800 flex-shrink-0">
          EVENT LOG
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {logs.length === 0 ? (
            <span className="text-slate-600 block text-center pt-10 italic">
              CONSOLE IDLE // READY FOR STRESS DISPATCH
            </span>
          ) : (
            logs.map((line, i) => (
              <div
                key={i}
                className={`leading-relaxed break-words ${
                  line.includes('❌')
                    ? 'text-rose-400 font-bold'
                    : line.includes('✅') || line.includes('🔄')
                      ? 'text-emerald-400'
                      : line.includes('⚡') || line.includes('💥')
                        ? 'text-amber-300'
                        : 'text-slate-300'
                }`}
              >
                {line}
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950 text-[10px] text-slate-500 flex-shrink-0">
        Active Environment Status: Stress Isolation Mode
      </div>
    </div>
  );
}
