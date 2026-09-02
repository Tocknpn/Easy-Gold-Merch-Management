import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = () => Boolean(url && anonKey);

// Lazy singleton — created on first use so the demo still boots without env vars.
export let supabase: SupabaseClient | null = null;
if (isSupabaseConfigured()) {
  supabase = createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

export const getSupabase = (): SupabaseClient => {
  if (!supabase) throw new Error('Supabase is not configured. See .env.example');
  return supabase;
};