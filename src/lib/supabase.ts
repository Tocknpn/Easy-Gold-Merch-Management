import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ── PUBLIC build-time config (safe to ship in the bundle) ─────────────────
// The anon key is PUBLIC by design — Supabase ships it inside every client
// bundle. It is useless without the user's JWT: RLS + `revoke execute on
// functions` (migration 0001) protect the data, so keeping RLS ON is required.
//
// Priority:
//   1. process.env (Cloudflare / GitHub Actions injected vars) — highest
//   2. .env / .env.production (Vite loads these during `vite build`)
//   3. This fallback — guarantees the app goes LIVE even if a host forgets
//      to inject the keys (the root cause of the "DEMO mode" problem).
const FALLBACK_URL = 'https://wkcfxlfyefiplehutrmc.supabase.co';
const FALLBACK_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrY2Z4bGZ5ZWZpcGxlaHV0cm1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDAxMzQsImV4cCI6MjEwMzkxNjEzNH0.bpSIMqFUR10T6rTMHfhPFlQwXOBx5MIdMbNTwFK2IYI';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || FALLBACK_URL;
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_ANON_KEY;

export const isSupabaseConfigured = () => Boolean(url && anonKey);

// Lazy singleton — created on first use so the demo still boots without env vars.
export let supabase: SupabaseClient | null = null;
if (isSupabaseConfigured()) {
  supabase = createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY_PRESENT = Boolean(anonKey);

export const getSupabase = (): SupabaseClient => {
  if (!supabase) throw new Error('Supabase is not configured. See .env.example');
  return supabase;
};