-- ============================================================
-- Easy Gold Merch — Ensure RLS read policies + SKU photo bucket
-- Run AFTER 0005_sku_image_storage.sql. SAFE TO RE-RUN.
--
-- Problem this fixes:
--   If 0001 was run on a partially-created schema (e.g. aborted on
--   the old missing cs_transactions), its RLS SELECT policies may be
--   missing. Result: authenticated users can WRITE via the RPC engine
--   (security definer) but READ 0 rows from the tables directly → the
--   app shows empty data even though seed rows exist.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Recreate a SELECT policy on every app table for authenticated users.
--    (drop-if-exists + create, so it is safe to run more than once)
-- ------------------------------------------------------------------
do $$
declare
  t    text;
  tbs  text[] := array[
    'users', 'skus', 'tickets', 'ticket_items', 'stock_transactions',
    'ticket_actions', 'system_config', 'categories', 'sku_remarks',
    'settings_log', 'cs_skus', 'cs_transactions'
  ];
begin
  foreach t in array tbs
  loop
    execute format('drop policy if exists "read %s" on public.%I', t, t);
  end loop;

  foreach t in array tbs
  loop
    execute format(
      'create policy "read %s" on public.%I for select to authenticated using (true)',
      t, t
    );
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 2. Make sure authenticated can actually SELECT (table-level grant)
-- ------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- ------------------------------------------------------------------
-- 3. Make sure the SKU photo bucket exists (idempotent)
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sku-images',
  'sku-images',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;