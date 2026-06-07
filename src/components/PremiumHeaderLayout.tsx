import React, { useEffect, useMemo, useState } from 'react';
import { Role } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';

interface PremiumHeaderLayoutProps {
  currentRole: Role;
  onRoleChange: (role: Role) => void;
}

type TourPosition = 'bottom' | 'right' | 'left';

interface TourStep {
  title: string;
  content: string;
  position: TourPosition;
}

const tourSteps: TourStep[] = [
  {
    title: '🚨 Real-Time Triage Alerts',
    content: 'Monitor incoming high-priority escalations from edge kiosks and surface them instantly for clinical review.',
    position: 'bottom',
  },
  {
    title: '🖥️ Edge Infrastructure Telemetry',
    content: 'Track kiosk connectivity, uptime, and health metrics in a single control plane view.',
    position: 'bottom',
  },
  {
    title: '📊 Clinical Intelligence Node',
    content: 'Review AI confidence, doctor consensus, and safety signal trends for the most critical cases.',
    position: 'left',
  },
];

const roleOptions: Role[] = ['patient', 'caregiver', 'clinician', 'kiosk_operator', 'device_provider', 'insurance_partner', 'public_health', 'admin'];

export const PremiumHeaderLayout: React.FC<PremiumHeaderLayoutProps> = ({ currentRole, onRoleChange }) => {
  const { user } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const displayName = useMemo(() => {
    if (!user) return 'Clinical Operator';
    return user.displayName || user.email?.split('@')[0] || 'Clinical Operator';
  }, [user]);

  useEffect(() => {
    const hasCompletedTour = localStorage.getItem('medtriage_onboarding_complete');
    if (!hasCompletedTour) {
      const timer = window.setTimeout(() => setShowTour(true), 900);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem('medtriage_onboarding_complete', 'true');
    setShowTour(false);
    setCurrentStep(0);
  };

  const handleRoleSelect = async (newRole: Role) => {
      const previousRole = currentRole;
      if (previousRole === newRole) {
        setIsProfileOpen(false);
        return;
      }

      try {
        const timestamp = new Date().toISOString();
        const txHash = `0x${Math.random().toString(16).substr(2, 8)}`;

        await api.auditLogs.createEntry({
          timestamp,
          actor: user?.uid || 'anonymous_dev',
          role: previousRole,
          action: 'ROLE_SWITCH',
          targetResource: `security-token:${previousRole}→${newRole}`,
          severity: 'info',
          txHash,
        });

        onRoleChange(newRole);
        setIsProfileOpen(false);
      } catch (error) {
        console.error('Failed to log role-switch to audit ledger. Action denied.', error);
      }
    };

  return (
    <header className="h-20 bg-slate-950 text-white border-b border-slate-800 px-8 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center h-12 w-12 rounded-3xl bg-gradient-to-br from-cyan-400 to-slate-700 text-xl font-semibold shadow-lg shadow-cyan-900/20">
          MT
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-slate-400">MedTriage Core</p>
          <p className="text-2xl font-semibold text-white">Clinical Control Plane</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="space-y-1 text-right">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Current context</p>
          <p className="text-sm font-medium text-slate-100">{currentRole} Command</p>
        </div>

        <button
          type="button"
          onClick={() => setIsProfileOpen((prev) => !prev)}
          className="relative inline-flex items-center gap-3 rounded-full border border-slate-700 bg-slate-900/95 px-4 py-2 text-left shadow-lg shadow-slate-950/30 transition hover:border-slate-500"
          aria-haspopup="menu"
          aria-expanded={isProfileOpen}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-base font-semibold text-cyan-300">
            {currentRole.charAt(0)}
          </div>
          <div className="min-w-[170px]">
            <p className="text-sm font-medium text-white">{displayName}</p>
            <p className="text-xs text-slate-400">{currentRole} access</p>
          </div>
          <span className="text-slate-400">▾</span>
        </button>

        {isProfileOpen && (
          <div className="absolute right-10 top-20 z-40 w-72 rounded-3xl border border-slate-800 bg-slate-950 p-3 shadow-2xl shadow-slate-950/40">
            <div className="mb-3 px-3 text-xs uppercase tracking-[0.2em] text-slate-500">Simulate system authorization</div>
            <div className="space-y-2">
              {roleOptions.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleSelect(role)}
                  className={`w-full rounded-2xl px-4 py-3 text-left text-sm transition ${currentRole === role ? 'bg-slate-800 text-cyan-300 font-semibold' : 'text-slate-300 hover:bg-slate-900'}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{role.charAt(0).toUpperCase() + role.slice(1)}</span>
                    {currentRole === role && <span className="text-cyan-300">Active</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {role === 'admin' && 'Strongly restricted, audited support access'}
                    {role === 'clinician' && 'Full clinical review & case assignment'}
                    {role === 'kiosk_operator' && 'Kiosk and field device control'}
                    {role === 'device_provider' && 'Device diagnostics & system health'}
                    {role === 'insurance_partner' && 'Aggregate analytics & redacted reports'}
                    {role === 'public_health' && 'Population health analytics'}
                    {role === 'caregiver' && 'Limited dashboard view'}
                    {role === 'patient' && 'No portal access (MVP)'}
                  </p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setIsProfileOpen(false);
                setShowTour(true);
                setCurrentStep(0);
              }}
              className="mt-4 w-full rounded-2xl bg-slate-800 px-4 py-3 text-center text-xs uppercase tracking-[0.18em] text-cyan-300 transition hover:bg-slate-700"
            >
              Restart interactive tour
            </button>
          </div>
        )}
      </div>

      {showTour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-[32px] border border-slate-800 bg-slate-900 p-8 shadow-2xl shadow-slate-950/60">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">System Briefing</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Step {currentStep + 1} of {tourSteps.length}</h2>
              </div>
              <button
                type="button"
                onClick={completeOnboarding}
                className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-xs uppercase tracking-[0.24em] text-slate-300 transition hover:border-cyan-300"
              >
                Dismiss
              </button>
            </div>

            <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-950 p-6 text-slate-200 shadow-inner shadow-slate-950/20">
              <h3 className="text-xl font-semibold text-white">{tourSteps[currentStep].title}</h3>
              <p className="mt-3 leading-7 text-slate-300">{tourSteps[currentStep].content}</p>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {tourSteps.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentStep(idx)}
                    className={`h-2.5 rounded-full transition ${currentStep === idx ? 'w-16 bg-cyan-400' : 'w-8 bg-slate-700 hover:bg-slate-600'}`}
                    aria-label={`Go to step ${idx + 1}`}
                  />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <button
                  type="button"
                  disabled={currentStep === 0}
                  onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300 disabled:cursor-not-allowed disabled:opacity-50 hover:border-cyan-300"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (currentStep < tourSteps.length - 1) {
                      setCurrentStep((step) => step + 1);
                    } else {
                      completeOnboarding();
                    }
                  }}
                  className="rounded-2xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
                >
                  {currentStep === tourSteps.length - 1 ? 'Acknowledge & Initialize' : 'Next Protocol'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
