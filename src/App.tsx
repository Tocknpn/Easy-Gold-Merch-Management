import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { DataProvider } from '@/contexts/DataContext';
import { AppShell } from '@/components/Layout';
import { ToastViewport, Spinner } from '@/components/ui/primitives';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { RequestPage } from '@/pages/RequestPage';
import { TicketTrackingPage } from '@/pages/TicketTrackingPage';
import { ActionCenterPage } from '@/pages/ActionCenterPage';
import { ReportingPage } from '@/pages/ReportingPage';
import { ManageStockPage } from '@/pages/ManageStockPage';
import { SystemSettingsPage } from '@/pages/SystemSettingsPage';
import { DiagnosticsPage } from '@/pages/DiagnosticsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30 * 1000, gcTime: 10 * 60 * 1000, retry: 1 },
  },
});

const ROUTES: { path: string; pageKey: string; roles: string[] }[] = [
  { path: '/dashboard', pageKey: 'dashboard', roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service', 'hr', 'pa'] },
  { path: '/request', pageKey: 'request', roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'customer_service'] },
  { path: '/ticket-tracking', pageKey: 'ticket-tracking', roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service', 'hr', 'pa'] },
  { path: '/manage-stock', pageKey: 'manage-stock', roles: ['warehouse', 'customer_service', 'director', 'admin'] },
  { path: '/action-center', pageKey: 'action-center', roles: ['warehouse', 'line_manager', 'director', 'admin'] },
  { path: '/reporting', pageKey: 'reporting', roles: ['warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service'] },
  { path: '/settings', pageKey: 'settings', roles: ['admin', 'warehouse', 'customer_service'] },
  { path: '/diagnostics', pageKey: 'diagnostics', roles: ['staff', 'warehouse', 'line_manager', 'director', 'admin', 'finance', 'customer_service', 'hr', 'pa'] },
];

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  const allowed = new Set(
    user.role === 'admin'
      ? ROUTES.map((r) => r.pageKey)
      : ROUTES.filter((r) => r.roles.includes(user.role)).map((r) => r.pageKey),
  );
  return (
    <DataProvider role={user.role}>
      <AppShell>
        <Routes>
          {ROUTES.map((r) => (
            <Route
              key={r.path}
              path={r.path}
              element={allowed.has(r.pageKey) ? <PageFor pageKey={r.pageKey} /> : <NoAccess />}
            />
          ))}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          {/* legacy stock pages → merged Manage Stock workspace */}
          <Route path="/total-stock" element={<Navigate to="/manage-stock?tab=overview" replace />} />
          <Route path="/cs-destock" element={<Navigate to="/manage-stock?tab=adjust" replace />} />
          <Route path="/transfer" element={<Navigate to="/manage-stock?tab=transfer" replace />} />
          {/* legacy report URLs → Reporting workspace */}
          <Route path="/inventory-report" element={<Navigate to="/reporting?tab=balance" replace />} />
          <Route path="/month-end-report" element={<Navigate to="/reporting?tab=month-end" replace />} />
          <Route path="/inventory" element={<Navigate to="/reporting?tab=balance" replace />} />
          <Route path="/month-end" element={<Navigate to="/reporting?tab=month-end" replace />} />
          <Route path="/new-request" element={<Navigate to="/request?mode=request" replace />} />
          <Route path="/borrow" element={<Navigate to="/request?mode=borrow" replace />} />
          <Route path="/my-tickets" element={<Navigate to="/ticket-tracking" replace />} />
          <Route path="/history" element={<Navigate to="/ticket-tracking?scope=all" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AppShell>
    </DataProvider>
  );
}

function PageFor({ pageKey }: { pageKey: string }) {
  switch (pageKey) {
    case 'dashboard': return <DashboardPage />;
    case 'request': return <RequestPage />;
    case 'ticket-tracking': return <TicketTrackingPage />;
    case 'action-center': return <ActionCenterPage />;
    case 'reporting': return <ReportingPage />;
    case 'manage-stock': return <ManageStockPage />;
    case 'settings': return <SystemSettingsPage />;
    case 'diagnostics': return <DiagnosticsPage />;
    default: return <NotFoundPage />;
  }
}

function NoAccess() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate('/dashboard'), 1800);
    return () => clearTimeout(t);
  }, [navigate]);
  return (
    <div className="card card-pad mx-auto mt-16 max-w-md text-center">
      <p className="text-3xl">🔒</p>
      <h2 className="mt-2 text-lg font-semibold">No access to this page</h2>
      <p className="mt-1 text-sm text-slate-500">Your role does not include this module. Redirecting…</p>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner label="Loading session…" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Protected />} />
          </Routes>
          <ToastViewport />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}