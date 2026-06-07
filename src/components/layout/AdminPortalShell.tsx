import React from 'react';
import {
  Activity,
  Users,
  MonitorSmartphone,
  BrainCircuit,
  Bell,
  Settings,
  Search,
  ChevronDown,
  LayoutDashboard,
} from 'lucide-react';

export type NavItem =
  | 'command-center'
  | 'triage-queue'
  | 'kiosk-fleet'
  | 'llm-pipelines'
  | 'user-roles'
  | 'audit-logs'
  | 'rag-pipelines'
  | 'mobile-interfaces';

interface AdminPortalShellProps {
  children: React.ReactNode;
  activeNav: NavItem;
  onNavChange: (nav: NavItem) => void;
}

const navSections = [
  {
    label: 'Operations',
    items: [
      { id: 'command-center' as NavItem, label: 'Command Center', icon: LayoutDashboard },
      { id: 'triage-queue' as NavItem, label: 'Live Triage Queue', icon: Users },
    ],
  },
  {
    label: 'Edge & AI',
    items: [
      { id: 'kiosk-fleet' as NavItem, label: 'Kiosk Fleet', icon: MonitorSmartphone },
      { id: 'llm-pipelines' as NavItem, label: 'LLM Pipelines', icon: BrainCircuit },
      { id: 'rag-pipelines' as NavItem, label: 'RAG Pipelines', icon: BrainCircuit },
      { id: 'mobile-interfaces' as NavItem, label: 'Mobile Interfaces', icon: MonitorSmartphone },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'user-roles' as NavItem, label: 'User Roles', icon: Users },
      { id: 'audit-logs' as NavItem, label: 'Audit Logs', icon: Activity },
    ],
  },
];

export default function AdminPortalShell({ children, activeNav, onNavChange }: AdminPortalShellProps) {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* ─── Left Sidebar ─── */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 z-20">
        {/* Brand */}
        <div className="h-16 flex items-center px-6 border-b border-slate-100">
          <div className="flex items-center gap-2 text-indigo-600">
            <BrainCircuit size={24} />
            <span className="font-bold text-lg tracking-tight text-slate-900">TriageOS</span>
          </div>
        </div>

        {/* Clinic Selector */}
        <div className="p-4">
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                HQ
              </div>
              <span className="text-sm font-medium">Central Network</span>
            </div>
            <ChevronDown size={16} className="text-slate-400" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 mt-6">
                {section.label}
              </p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavChange(item.id)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon size={18} className="mr-3 flex-shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* ─── Main Content Wrapper ─── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-10 flex-shrink-0">
          <div className="flex-1 max-w-md relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search patients, kiosks, or triage IDs..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-4">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-medium rounded-lg shadow-sm hover:shadow transition-all">
              <BrainCircuit size={16} /> AI Status: Active
            </button>
            <div className="h-6 w-px bg-slate-200 mx-2" />
            <button className="text-slate-400 hover:text-slate-600 relative">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white" />
            </button>
            <button className="text-slate-400 hover:text-slate-600">
              <Settings size={20} />
            </button>
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm ml-2">
              AD
            </div>
          </div>
        </header>

        {/* Dashboard Canvas */}
        <div className="flex-1 overflow-y-auto p-8">{children}</div>
      </main>
    </div>
  );
}
