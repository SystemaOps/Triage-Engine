import React, { useState } from 'react';
import {
  Activity,
  Users,
  MonitorSmartphone,
  BrainCircuit,
  Bell,
  Settings,
  Search,
  LayoutDashboard,
  Database,
  ScanText,
  Mic,
  Volume2,
  Headphones,
  Bone,
  Eye,
  Building2,
  Zap,
} from 'lucide-react';

export type NavItem =
  | 'command-center'
  | 'triage-queue'
  | 'kiosk-fleet'
  | 'llm-pipelines'
  | 'vector-search'
  | 'ocr-processing'
  | 'stt-processing'
  | 'tts-processing'
  | 'voice-triage-processing'
  | 'xray-processing'
  | 'visual-processing'
  | 'user-roles'
  | 'audit-logs'
  | 'settings'
  | 'notifications'
  | 'rag-pipelines'
  | 'mobile-interfaces'
  | 'organization';

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
    label: 'Intelligence',
    items: [
      { id: 'vector-search' as NavItem, label: 'Vector Search', icon: Database },
      { id: 'ocr-processing' as NavItem, label: 'OCR Processing', icon: ScanText },
      { id: 'stt-processing' as NavItem, label: 'STT Transcription', icon: Mic },
      { id: 'tts-processing' as NavItem, label: 'TTS Speech', icon: Volume2 },
      { id: 'voice-triage-processing' as NavItem, label: 'Voice Triage', icon: Headphones },
      { id: 'xray-processing' as NavItem, label: 'X-Ray Analysis', icon: Bone },
      { id: 'visual-processing' as NavItem, label: 'Visual Analysis', icon: Eye },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'organization' as NavItem, label: 'Organization', icon: Building2 },
      { id: 'notifications' as NavItem, label: 'Notifications', icon: Bell },
      { id: 'user-roles' as NavItem, label: 'User Roles', icon: Users },
      { id: 'audit-logs' as NavItem, label: 'Audit Logs', icon: Activity },
      { id: 'settings' as NavItem, label: 'System Settings', icon: Settings },
    ],
  },
];

export default function AdminPortalShell({ children, activeNav, onNavChange }: AdminPortalShellProps) {
  const [aiStatusOpen, setAiStatusOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* ─── Left Sidebar ─── */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 z-20">
        {/* Brand */}
        <div className="h-16 flex items-center px-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-sm shadow-indigo-200 flex-shrink-0 overflow-hidden">
              <img src="/favicon.png" alt="MedTriage" className="w-6 h-6 object-contain brightness-0 invert" />
            </div>
            <div className="leading-tight">
              <span className="font-bold text-sm tracking-tight text-slate-900 block">MedTriage OS</span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest">Control Plane</span>
            </div>
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

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAiStatusOpen(!aiStatusOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-semibold rounded-lg shadow-sm hover:shadow-md hover:from-indigo-500 hover:to-violet-500 transition-all relative"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
              <Zap size={13} /> AI Active
              {aiStatusOpen && (
                <div className="absolute top-full left-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 text-left z-30 animate-fade-in-scale">
                  <div className="flex items-center gap-2 mb-3">
                    <img src="/favicon.png" alt="" className="w-5 h-5 object-contain" />
                    <p className="text-xs font-bold text-slate-900">AI Pipeline Status</p>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Embeddings</span>
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">text-embedding-3-small</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Vector index</span>
                      <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Pinecone 1536d</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">Inference</span>
                      <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Operational</span>
                    </div>
                  </div>
                </div>
              )}
            </button>
            <div className="h-6 w-px bg-slate-200 mx-2" />
            <button
              onClick={() => onNavChange('notifications')}
              className="text-slate-400 hover:text-slate-600 relative"
              title="Notifications"
            >
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white" />
            </button>
            <button
              onClick={() => onNavChange('settings')}
              className="text-slate-400 hover:text-slate-600"
              title="Settings"
            >
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
