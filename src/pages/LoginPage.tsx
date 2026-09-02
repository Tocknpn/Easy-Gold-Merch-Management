import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, Lock, Mail, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/primitives';

const DEMO_USERS = [
  { email: 'tockppd@gmail.com', password: 'easygold1234', label: 'Super Admin — Nopphanai' },
  { email: 'sout2017@gmail.com', password: 'easygold1234', label: 'Warehouse — Soudsada' },
  { email: 'sphengxay@gmail.com', password: 'easygold1234', label: 'Director — Souliphonh' },
  { email: 'alounys08@gmail.com', password: 'easygold1234', label: 'Line Manager — Alouny' },
  { email: 'phonethida.easygold@gmail.com', password: 'easygold1234', label: 'Staff — Phonethida' },
  { email: 'cs@easygold.com', password: 'easygold1234', label: 'Customer Service' },
];

export function LoginPage() {
  const { login, loading, isDemo } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('tockppd@gmail.com');
  const [password, setPassword] = useState('easygold1234');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      toast('Welcome back 👋', 'info');
      navigate('/dashboard');
    } catch (err: any) {
      const msg = err?.message || 'Login failed';
      setError(msg);
      toast(msg, 'error');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-accent-600 p-4">
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-125 w-125 rounded-full bg-accent-500/20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-amber-300 shadow-glow ring-1 ring-white/25 backdrop-blur">
            <Crown className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-white">Easy Gold Merch</h1>
          <p className="mt-1 text-sm text-brand-200">MIMS 2026 — StockFlow Manager</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-pop sm:p-8">
          <label className="label">Email address</label>
          <div className="relative mb-4">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@easygold.com"
              required
            />
          </div>

          <label className="label">Password</label>
          <div className="relative mb-2">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          {isDemo && (
            <div className="mt-5">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Sparkles className="h-3 w-3 text-brand-500" /> Demo preview — quick accounts (real data seed)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.email}
                    type="button"
                    onClick={() => { setEmail(u.email); setPassword(u.password); }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  >
                    {u.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Offline mode (in-memory data from your Excel seed). Set up .env for Supabase to go live.
              </p>
            </div>
          )}
        </form>

        <p className="mt-5 text-center text-xs text-brand-200/80">Easy Gold By Khamphouvong · Internal stock control</p>
      </div>
    </div>
  );
}