import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppUser, UserRole } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';
import { apiLogin } from '@/lib/api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasAccess: (roles: UserRole[] | string[]) => boolean;
  isDemo: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const SESSION_KEY = 'sf_user';

export const roleFromRaw = (raw?: string | null): UserRole => {
  const m: Record<string, UserRole> = {
    staff: 'staff', warehouse: 'warehouse', 'warehouse manager': 'warehouse',
    'line manager': 'line_manager', director: 'director', admin: 'admin',
    finance: 'finance', 'customer service': 'customer_service', hr: 'hr', pa: 'pa',
  };
  return m[String(raw || '').toLowerCase().trim()] || 'staff';
};

function readSession(): AppUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as AppUser;
    return { ...u, role: roleFromRaw(u.role), fullName: u.fullName || u.email };
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => readSession());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user?.email) {
        const { data: profile } = await supabase!
          .from('users')
          .select('id,username,email,full_name,department,role,status')
          .eq('email', data.session.user.email.toLowerCase())
          .maybeSingle();
        if (profile) {
          const u: AppUser = {
            id: profile.id, username: profile.username, email: profile.email,
            fullName: profile.full_name || data.session.user.email,
            department: profile.department || '',
            role: roleFromRaw(profile.role), status: profile.status || 'Active',
          };
          setUser(u);
          localStorage.setItem(SESSION_KEY, JSON.stringify(u));
        }
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        localStorage.removeItem(SESSION_KEY);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const u = await apiLogin(email, password);
      const normalized = { ...u, role: roleFromRaw(u.role), fullName: u.fullName || u.email };
      setUser(normalized);
      localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    if (isSupabaseConfigured() && supabase) {
      await supabase.auth.signOut().catch(() => {});
    }
  };

  const hasAccess = (roles: UserRole[] | string[]) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return roles.includes(user.role);
  };

  const value = useMemo<AuthCtx>(() => ({
    user, loading, login, logout, hasAccess, isDemo: !isSupabaseConfigured(),
  }), [user, loading, login, logout, hasAccess]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export const getUserRoleLabel = (role: string) => ROLE_LABELS[role] || role;