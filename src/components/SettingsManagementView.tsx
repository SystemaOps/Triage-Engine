import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Role } from '../types';
import { useAuth } from '../context/AuthContext';

export default function SettingsManagementView({ userRole }: { userRole: Role }) {
  const { user: currentUser } = useAuth();
  const [settings, setSettings] = useState<{
    clinicalThresholds: { spo2: number; heartRate: number; bloodPressure: number; temperature: number; glucose: number };
    escalationRules: { selfCare: string; doctorConsultation: string; urgentCare: string; emergency: string };
    aiConfig: { confidenceThreshold: number; humanReviewThreshold: number; autoEscalation: boolean };
    notificationSettings: { emailAlerts: boolean; smsAlerts: boolean; criticalOnly: boolean };
    auditSettings: { retentionDays: number; exportPolicy: string };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.settings.get();
        if (!cancelled) setSettings(data);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const updateField = <K extends keyof NonNullable<typeof settings>>(section: K, field: string, value: unknown) => {
    setSettings(prev => {
      if (!prev) return prev;
      return { ...prev, [section]: { ...(prev[section] as Record<string, unknown>), [field]: value } };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !currentUser) return;

    setSaving(true);
    setSaveResult('idle');
    setErrorMessage('');

    try {
      await api.settings.update(
        currentUser.uid,
        userRole,
        settings,
        `Configuration updated by ${currentUser.uid}`
      );
      setSaveResult('success');
    } catch (err) {
      setSaveResult('error');
      setErrorMessage(err instanceof Error ? err.message : 'Write operation failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center font-mono text-xs text-slate-400 animate-pulse tracking-widest">
        SYNCHRONIZING GLOBAL CONFIGURATION NODE...
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex h-[80vh] items-center justify-center font-mono text-xs text-slate-400">
        Failed to load configuration. Check console for details.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/60 pb-5">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">System Configuration Node</h2>
          <p className="text-sm text-slate-500">Global administrative thresholds, model consensus parameters, and audit policy controls.</p>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] bg-white border border-slate-200/80 px-3 py-1.5 rounded-xl text-slate-500 shadow-sm">
          <span className={`w-2 h-2 rounded-full ${saveResult === 'success' ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {saveResult === 'success' ? 'Synced' : 'Live'}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Row 1: AI Config + Clinical Thresholds */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Configuration */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">AI Consensus Engine</h3>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold uppercase text-slate-500">Confidence Threshold</label>
                <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {Math.round(settings.aiConfig.confidenceThreshold * 100)}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">Minimum AI confidence required before a triage suggestion is surfaced to clinical staff.</p>
              <input
                type="range" min="0.5" max="0.99" step="0.01"
                value={settings.aiConfig.confidenceThreshold}
                onChange={e => updateField('aiConfig', 'confidenceThreshold', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-950"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-xs font-bold uppercase text-slate-500">Human Review Threshold</label>
                <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {Math.round(settings.aiConfig.humanReviewThreshold * 100)}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mb-3">Below this confidence, the case is automatically flagged for mandatory human-in-the-loop review.</p>
              <input
                type="range" min="0.1" max="0.8" step="0.01"
                value={settings.aiConfig.humanReviewThreshold}
                onChange={e => updateField('aiConfig', 'humanReviewThreshold', parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-950"
              />
            </div>

            <div className="flex items-center justify-between bg-slate-50 border border-slate-100 p-4 rounded-xl">
              <div>
                <span className="block text-sm font-bold text-slate-900">Auto-Escalation</span>
                <span className="block text-xs text-slate-500">Automatically escalate critical cases to the attending physician queue.</span>
              </div>
              <button
                type="button"
                onClick={() => updateField('aiConfig', 'autoEscalation', !settings.aiConfig.autoEscalation)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.aiConfig.autoEscalation ? 'bg-slate-900' : 'bg-slate-200'
                }`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  settings.aiConfig.autoEscalation ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          {/* Clinical Thresholds */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Clinical Vital Thresholds</h3>
            <p className="text-[11px] text-slate-400 -mt-2">Upper-bound alerting limits for peripheral biosensor readings.</p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {([
                { key: 'spo2', label: 'SpO₂ %', suffix: '%' },
                { key: 'heartRate', label: 'Heart Rate', suffix: 'bpm' },
                { key: 'bloodPressure', label: 'Blood Pressure', suffix: 'mmHg' },
                { key: 'temperature', label: 'Temperature', suffix: '°C' },
                { key: 'glucose', label: 'Glucose', suffix: 'mg/dL' },
              ] as const).map(field => (
                <div key={field.key}>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">{field.label}</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={settings.clinicalThresholds[field.key]}
                      onChange={e => updateField('clinicalThresholds', field.key, Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-mono">{field.suffix}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Escalation Rules + Notifications & Audit */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Escalation Rules */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Escalation Routing Matrix</h3>
            <p className="text-[11px] text-slate-400 -mt-2">Maps triage urgency levels to downstream clinical response tiers.</p>

            <div className="space-y-3">
              {([
                { key: 'selfCare' as const, label: 'Self-Care' },
                { key: 'doctorConsultation' as const, label: 'Doctor Consultation' },
                { key: 'urgentCare' as const, label: 'Urgent Care' },
                { key: 'emergency' as const, label: 'Emergency' },
              ]).map(rule => (
                <div key={rule.key} className="flex items-center justify-between py-1.5">
                  <span className="text-sm font-medium text-slate-700">{rule.label}</span>
                  <select
                    value={settings.escalationRules[rule.key]}
                    onChange={e => updateField('escalationRules', rule.key, e.target.value)}
                    className="px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-700 font-bold"
                  >
                    {['Low', 'Medium', 'High', 'Critical'].map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Notifications & Audit */}
          <div className="space-y-6">
            {/* Notification Settings */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Notification Routing</h3>

              <div className="space-y-3">
                {([
                  { key: 'emailAlerts' as const, label: 'Email Alerts', desc: 'Dispatch notifications via SMTP relay to registered operators.' },
                  { key: 'smsAlerts' as const, label: 'SMS Alerts', desc: 'Route critical alerts through the SMS gateway provider.' },
                  { key: 'criticalOnly' as const, label: 'Critical-Only Mode', desc: 'Suppress non-critical notifications. Only emergency-level events are broadcast.' },
                ]).map(toggle => (
                  <div key={toggle.key} className="flex items-center justify-between py-1">
                    <div>
                      <span className="block text-sm font-medium text-slate-700">{toggle.label}</span>
                      <span className="block text-[11px] text-slate-400">{toggle.desc}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField('notificationSettings', toggle.key, !settings.notificationSettings[toggle.key])}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        settings.notificationSettings[toggle.key] ? 'bg-slate-900' : 'bg-slate-200'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.notificationSettings[toggle.key] ? 'translate-x-4' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Settings */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Audit & Compliance</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Retention Period</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={settings.auditSettings.retentionDays}
                      onChange={e => updateField('auditSettings', 'retentionDays', Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800 font-mono"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-mono">days</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">Export Format</label>
                  <select
                    value={settings.auditSettings.exportPolicy}
                    onChange={e => updateField('auditSettings', 'exportPolicy', e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 text-slate-800 font-mono"
                  >
                    {['PDF', 'CSV', 'JSON', 'HL7'].map(fmt => (
                      <option key={fmt} value={fmt}>{fmt}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Save Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !currentUser}
            className="px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-sm transition-all disabled:opacity-50 min-w-[140px]"
          >
            {saving ? 'Committing...' : 'Commit Configuration'}
          </button>
          {saveResult === 'success' && (
            <span className="text-xs font-mono font-bold text-emerald-600 animate-fade-in">
              ✓ Parameters committed to global manifest.
            </span>
          )}
          {saveResult === 'error' && (
            <span className="text-xs font-mono font-bold text-rose-600 animate-fade-in">
              ✕ Write failed: {errorMessage}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
