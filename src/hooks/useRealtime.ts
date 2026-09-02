import { useEffect } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

// Push-based refresh: any change to the tracked tables (via the RPC engine or
// the seed) invalidates the in-memory bundle and re-fetches — every open tab
// updates within ~1s, no polling, no manual Refresh button needed.
export function useRealtimeRefresh(onChange: () => void) {
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;
    const tables = [
      'tickets', 'ticket_items', 'stock_transactions', 'skus',
      'cs_skus', 'cs_transactions', 'categories', 'system_config',
    ] as const;
    const channel = supabase!
      .channel('sf-realtime')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => onChange())
      .subscribe();

    // subscribe per-table for reliable delivery in older projects
    const subs = tables.map((table) =>
      supabase!
        .channel(`sf-${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange())
        .subscribe()
    );

    return () => {
      supabase!.removeChannel(channel);
      subs.forEach((s) => supabase!.removeChannel(s));
    };
  }, [onChange]);
}