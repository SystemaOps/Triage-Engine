import React, { useState } from 'react';
import { api } from '../lib/api';
import { ShieldCheck, Activity, BrainCircuit, Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.login(email, password);
      onLoginSuccess();
    } catch {
      setError('Invalid credentials. Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* ── Left: Brand Panel ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-white" />
        </div>

        {/* Brand */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <img src="/favicon.png" alt="MedTriage" className="w-7 h-7 object-contain brightness-0 invert" />
          </div>
          <div>
            <span className="text-white font-bold text-lg tracking-tight">MedTriage OS</span>
            <p className="text-indigo-200 text-[10px] uppercase tracking-widest">Clinical Operations Control Plane</p>
          </div>
        </div>

        {/* Hero */}
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-white/15 backdrop-blur flex items-center justify-center mb-8 shadow-2xl">
            <img src="/favicon.png" alt="" className="w-16 h-16 object-contain brightness-0 invert" />
          </div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            AI-Powered<br />Clinical Triage
          </h1>
          <p className="text-indigo-200 text-base leading-relaxed max-w-sm">
            Real-time patient flow management with vector search, multi-modal AI analysis, and HIPAA-grade audit trails.
          </p>

          {/* Feature chips */}
          <div className="mt-8 flex flex-wrap gap-2">
            {[
              { icon: ShieldCheck, label: 'Zero-trust RBAC' },
              { icon: BrainCircuit, label: 'LLM Triage AI' },
              { icon: Activity, label: 'Live Kiosk Fleet' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 bg-white/15 backdrop-blur text-white text-xs font-medium px-3 py-1.5 rounded-full">
                <Icon size={12} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative text-indigo-300 text-xs">
          © 2026 MedTriage OS · All clinical data encrypted at rest
        </div>
      </div>

      {/* ── Right: Login Form ── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-2 mb-8 justify-center">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <img src="/favicon.png" alt="" className="w-6 h-6 object-contain brightness-0 invert" />
            </div>
            <span className="font-bold text-slate-900">MedTriage OS</span>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-1">Sign in</h2>
          <p className="text-sm text-slate-500 mb-8">Access the Clinical Operations Control Plane</p>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-xl animate-fade-in">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Email address
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="clinician@hospital.org"
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-500 transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold text-sm rounded-xl transition-all shadow-sm shadow-indigo-200 hover:shadow-md hover:shadow-indigo-200 mt-6"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Authenticating…</>
              ) : (
                'Sign in to MedTriage OS'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-8">
            Protected by Firebase Authentication · Role-based access enforced
          </p>
        </div>
      </div>
    </div>
  );
}
