import React, { useState, useMemo } from 'react';
import { Role } from './types';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import DashboardView from './components/DashboardView';
import UserManagementView from './components/UserManagementView';
import PatientManagementView from './components/PatientManagementView';
import KioskManagementView from './components/KioskManagementView';
import ModelManagementView from './components/ModelManagementView';
import ReportManagementView from './components/ReportManagementView';
import AuditLogView from './components/AuditLogView';
import LoginPage from './components/LoginPage';
import SettingsManagementView from './components/SettingsManagementView';
import NotificationCenterView from './components/NotificationCenterView';
import OrganizationManagementView from './components/OrganizationManagementView';
import SystemHealthDashboardView from './components/SystemHealthDashboardView';
import AnalyticsDashboardView from './components/AnalyticsDashboardView';
import DebugChaosDrawer from './components/DebugChaosDrawer';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PremiumHeaderLayout } from './components/PremiumHeaderLayout';
import { LayoutDashboard, Users, HeartPulse, MonitorSpeaker, Brain, FileText, ScrollText, Settings, Bell, Building2, Activity, BarChart3 } from 'lucide-react';
import AdminPortalShell, { type NavItem } from './components/layout/AdminPortalShell';
import TriageQueue from './views/TriageQueue';
import CommandCenter from './views/CommandCenter';

// Load Firebase config from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth();

// ── Role-to-tab mapping ──
const roleTabs: Record<Role, string[]> = {
  patient: [],
  caregiver: ['Dashboard'],
  clinician: ['Dashboard', 'Patients', 'Reports', 'Models', 'Notifications'],
  kiosk_operator: ['Dashboard', 'Kiosks', 'Notifications'],
  device_provider: ['Dashboard', 'Kiosks', 'System Health', 'Notifications'],
  insurance_partner: ['Dashboard', 'Reports', 'Analytics'],
  public_health: ['Dashboard', 'Analytics'],
  admin: ['Dashboard', 'Kiosks', 'Users', 'Settings', 'Audit Logs', 'Organization', 'System Health', 'Notifications', 'Analytics'],
};

const tabIcons: Record<string, React.ReactNode> = {
  'Dashboard': <LayoutDashboard size={16} />,
  'Patients': <HeartPulse size={16} />,
  'Kiosks': <MonitorSpeaker size={16} />,
  'Models': <Brain size={16} />,
  'Reports': <FileText size={16} />,
  'Audit Logs': <ScrollText size={16} />,
  'Users': <Users size={16} />,
  'Settings': <Settings size={16} />,
  'Notifications': <Bell size={16} />,
  'Organization': <Building2 size={16} />,
  'System Health': <Activity size={16} />,
  'Analytics': <BarChart3 size={16} />,
};

function AuthenticatedApp() {
  const { user } = useAuth();

  if (!user) {
    return <LoginPage onLoginSuccess={() => window.location.reload()} />;
  }

  const [activeTab, setActiveTab] = useState('Dashboard');
  const [userRole, setUserRole] = useState<Role>('admin');
  const [activeNav, setActiveNav] = useState<NavItem>('triage-queue');

  // ── Bridge Pattern: New Shell for admin/clinician, legacy tabbed for others ──
  const useNewShell = userRole === 'admin' || userRole === 'clinician';

  if (useNewShell) {
    return (
      <AdminPortalShell activeNav={activeNav} onNavChange={setActiveNav}>
        {activeNav === 'triage-queue' && <TriageQueue userRole={userRole} />}
        {activeNav === 'command-center' && <CommandCenter userRole={userRole} />}
        {activeNav === 'kiosk-fleet' && <KioskManagementView userRole={userRole} />}
        {activeNav === 'llm-pipelines' && <ModelManagementView userRole={userRole} />}
        {activeNav === 'user-roles' && <UserManagementView userRole={userRole} />}
        {activeNav === 'audit-logs' && <AuditLogView userRole={userRole} />}
        {activeNav === 'rag-pipelines' && <div className="flex items-center justify-center h-[60vh] text-slate-400 font-medium">RAG Pipeline management — coming soon.</div>}
        {activeNav === 'mobile-interfaces' && <div className="flex items-center justify-center h-[60vh] text-slate-400 font-medium">Mobile interface telemetry — coming soon.</div>}
        {import.meta.env.DEV && <DebugChaosDrawer />}
      </AdminPortalShell>
    );
  }

  const tabs = useMemo(() => roleTabs[userRole] ?? [], [userRole]);

  const safeActiveTab = tabs.includes(activeTab) ? activeTab : (tabs[0] ?? '');

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {tabs.length > 0 && (
        <nav className="w-64 bg-slate-900/40 border-r border-slate-800/60 backdrop-blur-xl flex flex-col">
          <div className="p-6 border-b border-slate-800/60">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-400 to-slate-700 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-900/20">
                MT
              </div>
              <div>
                <h1 className="text-sm font-bold text-white tracking-tight">MedTriage</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">Control Plane</p>
              </div>
            </div>
          </div>
          <ul className="p-3 space-y-0.5 flex-1">
            {tabs.map((tab) => (
              <li
                key={tab}
                className={`flex items-center gap-3 text-sm font-medium px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 ${
                  safeActiveTab === tab
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
                onClick={() => setActiveTab(tab)}
              >
                <span className={safeActiveTab === tab ? 'text-indigo-400' : 'text-slate-500'}>
                  {tabIcons[tab]}
                </span>
                {tab}
              </li>
            ))}
          </ul>
          <div className="p-4 border-t border-slate-800/60">
            <div className="flex items-center gap-2 text-[10px] text-slate-600 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              All systems nominal
            </div>
          </div>
        </nav>
      )}
      <div className="flex-1 flex flex-col min-h-screen">
        <PremiumHeaderLayout currentRole={userRole} onRoleChange={setUserRole} />
        <main className="flex-1 overflow-auto">
          {safeActiveTab === 'Dashboard' && <DashboardView userRole={userRole} />}
          {safeActiveTab === 'Patients' && <PatientManagementView userRole={userRole} />}
          {safeActiveTab === 'Kiosks' && <KioskManagementView userRole={userRole} />}
          {safeActiveTab === 'Models' && <ModelManagementView userRole={userRole} />}
          {safeActiveTab === 'Reports' && <ReportManagementView userRole={userRole} />}
          {safeActiveTab === 'Audit Logs' && <AuditLogView userRole={userRole} />}
          {safeActiveTab === 'Users' && <UserManagementView userRole={userRole} />}
          {safeActiveTab === 'Settings' && <SettingsManagementView userRole={userRole} />}
          {safeActiveTab === 'Notifications' && <NotificationCenterView userRole={userRole} />}
          {safeActiveTab === 'Organization' && <OrganizationManagementView userRole={userRole} />}
          {safeActiveTab === 'System Health' && <SystemHealthDashboardView userRole={userRole} />}
          {safeActiveTab === 'Analytics' && <AnalyticsDashboardView userRole={userRole} />}
        </main>
      </div>
      {import.meta.env.DEV && <DebugChaosDrawer />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}
