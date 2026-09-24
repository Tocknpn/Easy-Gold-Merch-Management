import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppUser, UserRole } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';
import { apiLogin } from '@/lib/api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { safeGet, safeRemove, safeSet } from '@/lib/safeStorage';
import { describeError, recordCrash } from '@/lib/crashLog';

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
    'line manager': 'line_manager', 'line_manager': 'line_manager',
    director: 'director', admin: 'admin',
    finance: 'finance', 'customer service': 'customer_service', 'customer_service': 'customer_service',
    hr: 'hr', pa: 'pa',
  };
  return m[String(raw || '').toLowerCase().trim()] || 'staff';
};

function readSession(): AppUser | null {
  // safeGet never throws — a browser that blocks site storage used to make this
  // crash (the old catch block called localStorage.removeItem again) and blank
  // the app before the login form could even paint.
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const u = JSON.parse(raw) as AppUser;
    if (!u || typeof u !== 'object') {
      safeRemove(SESSION_KEY);
      return null;
    }
    return { ...u, role: roleFromRaw(u.role), fullName: u.fullName || u.email };
  } catch {
    safeRemove(SESSION_KEY);
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
          // A deactivated account must not be able to resume an old session.
          if (String(profile.status || 'Active').toLowerCase() !== 'active') {
            await supabase!.auth.signOut().catch(() => {});
            safeRemove(SESSION_KEY);
            setUser(null);
            return;
          }
          const u: AppUser = {
            id: profile.id, username: profile.username, email: profile.email,
            fullName: profile.full_name || data.session.user.email,
            department: profile.department || '',
            role: roleFromRaw(profile.role), status: profile.status || 'Active',
          };
          setUser(u);
          safeSet(SESSION_KEY, JSON.stringify(u));
        }
      }
    }).catch((err) => {
      // A failed session check must not be silent (and must not blank the page):
      // the local session keeps the user working, the crash log records why.
      recordCrash({ message: `Session check failed: ${describeError(err).message}`, source: 'promise' });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        safeRemove(SESSION_KEY);
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
      safeSet(SESSION_KEY, JSON.stringify(normalized));
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    safeRemove(SESSION_KEY);
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