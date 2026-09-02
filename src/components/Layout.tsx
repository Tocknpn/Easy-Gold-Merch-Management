import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, PlusCircle, Warehouse, Crown,
  Ticket, Inbox, FileBarChart, Settings2, HeartPulse,
  RefreshCw, LogOut, Menu, X,
} from 'lucide-react';
import { useAuth, getUserRoleLabel } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/primitives';

interface NavDef {
  key: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

export const NAV_DEFS: NavDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service', 'hr', 'pa'] },
  { key: 'request', label: 'Request', icon: <PlusCircle className="h-4 w-4" />, roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'customer_service'] },
  { key: 'manage-stock', label: 'Manage Stock', icon: <Warehouse className="h-4 w-4" />, roles: ['warehouse', 'customer_service', 'director', 'admin'] },
  { key: 'ticket-tracking', label: 'Ticket Tracking', icon: <Ticket className="h-4 w-4" />, roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service', 'hr', 'pa'] },
  { key: 'action-center', label: 'Action Center', icon: <Inbox className="h-4 w-4" />, roles: ['warehouse', 'line_manager', 'director', 'admin'] },
  { key: 'reporting', label: 'Reporting', icon: <FileBarChart className="h-4 w-4" />, roles: ['warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service'] },
  { key: 'settings', label: 'System Settings', icon: <Settings2 className="h-4 w-4" />, roles: ['admin', 'warehouse', 'customer_service'] },
  { key: 'diagnostics', label: 'Diagnostics', icon: <HeartPulse className="h-4 w-4" />, roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service', 'hr', 'pa'] },
];

const ROLE_TO_PATH: Record<string, string> = {
  dashboard: 'dashboard', request: 'request',
  'manage-stock': 'manage-stock', 'ticket-tracking': 'ticket-tracking',
  'action-center': 'action-center', reporting: 'reporting',
  settings: 'settings', diagnostics: 'diagnostics',
};

export function pathToKey(path: string): string {
  const seg = path.split('/')[1] || 'dashboard';
  for (const [k, p] of Object.entries(ROLE_TO_PATH)) if (p === seg) return k;
  return 'dashboard';
}

export function keyToPath(key: string): string {
  return ROLE_TO_PATH[key] || 'dashboard';
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, hasAccess } = useAuth();
  const { actionableTicketCount, refresh, loading } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user) return null;
  const visible = NAV_DEFS.filter((n) => hasAccess(n.roles));
  const activeKey = pathToKey(location.pathname);

  const go = (key: string) => {
    setSidebarOpen(false);
    navigate('/' + keyToPath(key));
  };

  const doRefresh = async () => {
    setBusy(true);
    try { await refresh(); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      {/* Top toolbar — deep blue */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2.5 border-b border-brand-950/20 bg-gradient-to-r from-brand-950 via-brand-900 to-accent-600 px-3 text-white shadow-lg sm:px-5">
        <button
          className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button onClick={() => go(activeKey)} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
            <Crown className="h-4 w-4 text-amber-300" />
          </span>
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            Easy Gold <span className="hidden text-brand-200 sm:inline">Merge Management</span>
          </span>
        </button>
        <div className="flex-1" />
        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset md:inline-flex',
            isSupabaseConfigured()
              ? 'bg-emerald-400/15 text-emerald-100 ring-emerald-300/40'
              : 'bg-amber-400/20 text-amber-100 ring-amber-300/40',
          )}
          title={isSupabaseConfigured() ? 'Connected to Supabase' : 'Running in demo mode — edits are not saved'}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', isSupabaseConfigured() ? 'bg-emerald-300' : 'bg-amber-300')} />
          {isSupabaseConfigured() ? 'LIVE' : 'DEMO'}
        </span>
        <button
          onClick={doRefresh}
          disabled={busy || loading}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-100 transition hover:bg-white/10 disabled:opacity-50"
          title="Refresh data"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', (busy || loading) && 'animate-spin')} />
          <span className="hidden sm:inline">{busy ? 'Refreshing…' : 'Refresh'}</span>
        </button>
        {user && (
          <div className="flex items-center gap-2 rounded-lg bg-white/10 py-1 pl-1 pr-2.5 ring-1 ring-white/10">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/20 text-xs font-bold">
              {user.fullName?.charAt(0)?.toUpperCase() || 'U'}
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="max-w-[140px] truncate text-xs font-semibold">{user.fullName}</p>
              <p className="text-[10px] text-brand-200">{getUserRoleLabel(user.role)}</p>
            </div>
            <button onClick={logout} className="rounded-md p-1 text-brand-100 hover:bg-white/10" title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 lg:flex">
          <SidebarNav visible={visible} activeKey={activeKey} count={actionableTicketCount} go={go} />
          <div className="mt-auto rounded-xl bg-gradient-to-br from-brand-50 to-cyan-50 px-3.5 py-3 text-[11px] leading-relaxed text-slate-500 no-print">
            <p className="font-semibold text-brand-700">Easy Gold By Khamphouvong</p>
            <p className="mt-0.5">MIMS 2026 · {loading ? 'syncing…' : 'live'}</p>
          </div>
        </aside>

        {/* Mobile drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-72 bg-white p-4 shadow-pop animate-slide-in-right">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <Crown className="h-4 w-4 text-brand-600" /> Menu
                </span>
                <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SidebarNav visible={visible} activeKey={activeKey} count={actionableTicketCount} go={go} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function SidebarNav({
  visible, activeKey, count, go,
}: {
  visible: NavDef[]; activeKey: string; count: number; go:(k: string) => void;
}) {
  return (
    <nav className="space-y-0.5">
      <p className="px-2.5 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Menu</p>
      {visible.map((n) => (
        <button
          key={n.key}
          onClick={() => go(n.key)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition no-print',
            activeKey === n.key
              ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
              : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          <span className={cn('shrink-0', activeKey === n.key ? 'text-brand-600' : 'text-slate-400')}>{n.icon}</span>
          <span className="flex-1 truncate">{n.label}</span>
          {n.key === 'action-center' && count > 0 && (
            <Badge className="bg-brand-600 text-white ring-transparent">{count}</Badge>
          )}
        </button>
      ))}
    </nav>
  );
}