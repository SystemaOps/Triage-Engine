import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { AuditEntry, Role } from '../types';

export default function AuditLogView({ userRole }: { userRole: Role }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering & Search Control States
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'info' | 'warning' | 'critical'>('all');

  // Live Firestore Ledger Stream
  useEffect(() => {
    const unsubscribe = api.auditLogs.subscribeToAuditLogs((data) => {
      setLogs(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter Pipeline Processing
  const filteredLogs = logs.filter(log => {
    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
    
    const term = searchQuery.toLowerCase();
    const matchesSearch = 
      log.action.toLowerCase().includes(term) ||
      log.actor.toLowerCase().includes(term) ||
      log.targetResource.toLowerCase().includes(term) ||
      log.id.toLowerCase().includes(term) ||
      (log.txHash && log.txHash.toLowerCase().includes(term));

    return matchesSeverity && matchesSearch;
  });

  return (
    <div className="space-y-6 p-6 max-w-[1600px] mx-auto animate-fade-in">
      {/* Ledger Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Immutable Compliance & Security Ledger</h2>
        <p className="text-sm text-slate-500">Cryptographically anchored event stream tracking facility states, model routing transitions, and RBAC authorization validations.</p>
      </div>

      {/* Control Console Search & Filter Strips */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
        
        {/* Search Input Vector */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Filter by hash, action vectors, actor context..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-3 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/5 placeholder:text-slate-400 transition-all"
          />
        </div>

        {/* Dense Pillar Severity Filters */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-auto">
          {(['all', 'info', 'warning', 'critical'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                severityFilter === sev
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {/* High-Density Data Ledger Grid */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                <th className="py-3 px-4">Event Sign / ID</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Security Principal</th>
                <th className="py-3 px-4">Action Vector</th>
                <th className="py-3 px-4">Target Resource</th>
                <th className="py-3 px-4 text-right">Severity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-xs font-mono text-slate-400 animate-pulse">
                    SYNCHRONIZING WITH IMMUTABLE COMPLIANCE NODES...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-xs font-mono text-slate-400">
                    ZERO TELEMETRY RECORD MATCHES FOUND WITHIN PARSED SCOPE.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  // Determine system account status to visually drop contrast on automated entries
                  const isAutomatedAgent = log.actor.includes('sysops') || log.actor.includes('system');
                  
                  return (
                    <tr 
                      key={log.id} 
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Token Hash Identity Column */}
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-700">{log.id}</span>
                          <span className="text-[10px] text-slate-400 group-hover:text-blue-600 transition-colors">
                            {log.txHash || '0x00000000'}
                          </span>
                        </div>
                      </td>

                      {/* Precise Timestamp Mapping */}
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString(undefined, { hour12: false })}
                      </td>

                      {/* Security Principal Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className={`font-medium ${isAutomatedAgent ? 'text-slate-400 text-xs italic' : 'text-slate-800'}`}>
                            {log.actor}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tight">{log.role}</span>
                        </div>
                      </td>

                      {/* Action Vectors */}
                      <td className="py-3.5 px-4 font-mono text-xs">
                        <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-lg font-semibold text-[11px] border border-slate-200/50">
                          {log.action}
                        </span>
                      </td>

                      {/* Target Component Scope */}
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 max-w-[220px] truncate" title={log.targetResource}>
                        {log.targetResource}
                      </td>

                      {/* Color-Coded Severity Micro Pills */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          log.severity === 'critical' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                          log.severity === 'warning' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                          'bg-emerald-50 text-emerald-600 border border-emerald-100'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            log.severity === 'critical' ? 'bg-rose-500' :
                            log.severity === 'warning' ? 'bg-amber-400' : 'bg-emerald-500'
                          }`} />
                          {log.severity}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Ledger Count Aggregator Footer */}
        <div className="bg-slate-50/50 border-t border-slate-100 px-4 py-2.5 flex justify-between items-center text-[11px] font-mono text-slate-400">
          <span>Scope Boundary: Latency Truncation Enabled</span>
          <span>Showing {filteredLogs.length} of {logs.length} Live Log Documents</span>
        </div>
      </div>
    </div>
  );
}
