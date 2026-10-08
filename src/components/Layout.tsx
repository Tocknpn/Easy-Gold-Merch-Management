import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, PlusCircle, Warehouse, Crown,
  Ticket, Inbox, FileBarChart, Settings2, HeartPulse,
  RefreshCw, LogOut, Menu, X, PanelLeftClose, PanelLeftOpen, ScrollText,
} from 'lucide-react';
import { useAuth, getUserRoleLabel } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { safeGet, safeSet } from '@/lib/safeStorage';
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
  { key: 'audit', label: 'Audit Trail', icon: <ScrollText className="h-4 w-4" />, roles: ['admin'] },
  { key: 'settings', label: 'System Settings', icon: <Settings2 className="h-4 w-4" />, roles: ['admin', 'warehouse', 'customer_service'] },
  { key: 'diagnostics', label: 'Diagnostics', icon: <HeartPulse className="h-4 w-4" />, roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service', 'hr', 'pa'] },
];

const ROLE_TO_PATH: Record<string, string> = {
  dashboard: 'dashboard', request: 'request',
  'manage-stock': 'manage-stock', 'ticket-tracking': 'ticket-tracking',
  'action-center': 'action-center', reporting: 'reporting',
  settings: 'settings', diagnostics: 'diagnostics', audit: 'audit',
};

export function pathToKey(path: string): string {
  const seg = path.split('/')[1] || 'dashboard';
  for (const [k, p] of Object.entries(ROLE_TO_PATH)) if (p === seg) return k;
  return 'dashboard';
}

export function keyToPath(key: string): string {
  return ROLE_TO_PATH[key] || 'dashboard';
}

const SIDEBAR_COLLAPSED_KEY = 'eg-sidebar-collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, hasAccess } = useAuth();
  const { actionableTicketCount, refresh, loading } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => safeGet(SIDEBAR_COLLAPSED_KEY) === '1');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    safeSet(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Defensive: `Protected` already redirects when there is no session, but a
  // session that ends mid-render must never leave an empty page behind.
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="card card-pad max-w-sm text-center">
          <p className="text-sm font-semibold text-slate-700">Your session has ended</p>
          <p className="mt-1 text-xs text-slate-500">Taking you back to the sign-in page…</p>
        </div>
      </div>
    );
  }
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
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2.5 border-b border-brand-950/20 bg-gradient-to-r from-brand-950 via-brand-900 to-accent-600 px-3 text-white shadow-sm sm:px-5">
        <button
          className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          className="hidden rounded-lg p-1.5 text-brand-200 transition hover:bg-white/10 hover:text-white lg:inline-flex"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        <button onClick={() => go(activeKey)} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
            <Crown className="h-4 w-4 text-gold-300" />
          </span>
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            Easy Gold <span className="hidden text-brand-200 sm:inline">Merge Management</span>
          </span>
        </button>
        <div className="flex-1" />

        {/* Admin only: deploy version and git commit name */}
        {user?.role === 'admin' && (
          <div
            className="hidden items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-xs text-brand-100 ring-1 ring-white/15 md:inline-flex max-w-[280px] xl:max-w-[420px] truncate"
            title={`Deploy Version: ${__APP_VERSION__}\nCommit: ${__GIT_COMMIT_HASH__} - ${__GIT_COMMIT_MSG__}\nBranch: ${__GIT_BRANCH__}\nBuilt: ${__BUILD_TIME__}`}
          >
            <span className="font-semibold text-gold-300 shrink-0">{__APP_VERSION__}</span>
            <span className="text-white/40 shrink-0">·</span>
            <span className="rounded bg-black/25 px-1 py-0.5 font-mono text-[10px] text-brand-200 shrink-0">
              {__GIT_COMMIT_HASH__}
            </span>
            <span className="truncate text-[11px] text-slate-200" title={__GIT_COMMIT_MSG__}>
              {__GIT_COMMIT_MSG__ || 'latest commit'}
            </span>
          </div>
        )}

        <span
          className={cn(
            'hidden items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset md:inline-flex',
            isSupabaseConfigured()
              ? 'bg-emerald-400/15 text-emerald-100 ring-emerald-300/40'
              : 'bg-gold-400/20 text-gold-100 ring-gold-300/40',
          )}
          title={isSupabaseConfigured() ? 'Connected to Supabase' : 'Running in demo mode — edits are not saved'}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', isSupabaseConfigured() ? 'bg-emerald-300' : 'bg-gold-300')} />
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
        {/* Desktop sidebar — collapsible */}
        <aside
          className={cn(
            'sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-3 transition-all duration-200 lg:flex',
            collapsed ? 'w-[68px]' : 'w-60',
          )}
        >
          {/* Top header row with collapse button */}
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2">
            {!collapsed ? (
              <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Menu</span>
            ) : null}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 no-print',
                collapsed && 'mx-auto',
              )}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>

          <SidebarNav visible={visible} activeKey={activeKey} count={actionableTicketCount} go={go} collapsed={collapsed} />

          <div className="mt-auto flex flex-col items-center gap-2 pt-3">
            {!collapsed && (
              <div className="w-full rounded-xl bg-gradient-to-br from-brand-50 to-accent-400/10 px-3 py-2.5 text-[11px] leading-relaxed text-slate-500 no-print">
                <p className="font-semibold text-brand-700">Easy Gold By Khamphouvong</p>
                {user?.role === 'admin' ? (
                  <div className="mt-1.5 space-y-1 border-t border-brand-200/50 pt-1.5 text-[10px]">
                    <div className="flex items-center justify-between text-brand-900">
                      <span className="font-semibold">Deploy:</span>
                      <span className="font-mono font-bold text-brand-800">{__APP_VERSION__} ({__GIT_COMMIT_HASH__})</span>
                    </div>
                    <div className="text-slate-600" title={__GIT_COMMIT_MSG__}>
                      <span className="font-semibold text-slate-500">Commit: </span>
                      <span className="font-sans font-medium text-slate-700 break-words">{__GIT_COMMIT_MSG__}</span>
                    </div>
                    <div className="text-[9px] text-slate-400">
                      {__BUILD_TIME__} · {loading ? 'syncing…' : 'live'}
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5">MIMS 2026 · {loading ? 'syncing…' : 'live'}</p>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Mobile drawer */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <aside className="absolute left-0 top-0 h-full w-72 bg-white p-4 shadow-card animate-slide-in-right">
              <div className="mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <Crown className="h-4 w-4 text-brand-600" /> Menu
                </span>
                <button onClick={() => setSidebarOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <SidebarNav visible={visible} activeKey={activeKey} count={actionableTicketCount} go={go} collapsed={false} />
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
  visible, activeKey, count, go, collapsed,
}: {
  visible: NavDef[]; activeKey: string; count: number;
  go:(k: string) => void; collapsed: boolean;
}) {
  return (
    <nav className="space-y-0.5">
      {visible.map((n) => (
        <button
          key={n.key}
          onClick={() => go(n.key)}
          title={collapsed ? n.label : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition no-print',
            collapsed && 'justify-center px-0',
            activeKey === n.key
              ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'
              : 'text-slate-600 hover:bg-slate-50',
          )}
        >
          <span className={cn('shrink-0', activeKey === n.key ? 'text-brand-600' : 'text-slate-400')}>{n.icon}</span>
          {!collapsed && <span className="flex-1 truncate">{n.label}</span>}
          {!collapsed && n.key === 'action-center' && count > 0 && (
            <Badge className="bg-brand-600 text-white ring-transparent">{count}</Badge>
          )}
        </button>
      ))}
    </nav>
  );
}