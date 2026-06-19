import React, { useMemo } from 'react';
import { Role } from '../types';
import { useAuth } from '../context/AuthContext';

interface PremiumHeaderLayoutProps {
  currentRole: Role;
}

export const PremiumHeaderLayout: React.FC<PremiumHeaderLayoutProps> = ({ currentRole }) => {
  const { user } = useAuth();

  const displayName = useMemo(() => {
    if (!user) return 'Clinical Operator';
    return user.displayName || user.email?.split('@')[0] || 'Clinical Operator';
  }, [user]);

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

        <div className="inline-flex items-center gap-3 rounded-full border border-slate-700 bg-slate-900/95 px-4 py-2 shadow-lg shadow-slate-950/30">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-base font-semibold text-cyan-300">
            {currentRole.charAt(0)}
          </div>
          <div className="min-w-[170px]">
            <p className="text-sm font-medium text-white">{displayName}</p>
            <p className="text-xs text-slate-400">{currentRole} access</p>
          </div>
        </div>
      </div>
    </header>
  );
};
