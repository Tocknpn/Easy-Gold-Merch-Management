-- ============================================================
-- Easy Gold Merch — SKU photo storage (Supabase Storage)
-- Part 5: sku-images bucket + policies
-- Run AFTER 0004_ticket_state_machine.sql
-- ============================================================
-- How it works:
--   1. The SKU Setup form uploads the photo here (bucket "sku-images", public).
--   2. It saves the returned public URL into skus.image_url / cs_skus.image_url
--      via manage_sku / manage_cs_sku.
--   3. Every table, detail dialog and report already renders sku.imageUrl.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Create the public bucket "sku-images" (idempotent, 6 MB cap).
--    Public read = images can be shown in <img> on the web without auth.
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

-- ------------------------------------------------------------------
-- 2. Storage RLS policies (each in its own block so re-runs are safe)
-- ------------------------------------------------------------------

-- Anyone (including signed-out browsers / CDN) may READ sku photos.
do $$
begin
  create policy "sku images public read"
    on storage.objects for select to anon, authenticated
    using (bucket_id = 'sku-images');
exception when duplicate_object then null;
end $$;

-- Authenticated users (anyone logged into the app) may ADD new photos.
do $$
begin
  create policy "sku images auth insert"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'sku-images');
exception when duplicate_object then null;
end $$;

-- Authenticated users may REPLACE an existing photo (upsert).
do $$
begin
  create policy "sku images auth update"
    on storage.objects for update to authenticated
    using (bucket_id = 'sku-images');
exception when duplicate_object then null;
end $$;

-- Authenticated users may DELETE photos (used when a SKU image is removed/replaced).
do $$
begin
  create policy "sku images auth delete"
    on storage.objects for delete to authenticated
    using (bucket_id = 'sku-images');
exception when duplicate_object then null;
end $$;

-- ------------------------------------------------------------------
-- 3. set_sku_image RPC — explicitly set OR CLEAR a SKU photo.
--    manage_sku/manage_cs_sku keep the old image when image_url is
--    null (coalesce), so clearing needs this dedicated function.
-- ------------------------------------------------------------------
create or replace function public.set_sku_image(
  p_sku_id text,
  p_image_url text,            -- 'https://…' to set, NULL to clear
  p_warehouse text default 'mkt' -- 'mkt' | 'cs'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_warehouse = 'cs' then
    update public.cs_skus set image_url = p_image_url where id = p_sku_id;
  else
    update public.skus set image_url = p_image_url where id = p_sku_id;
  end if;
  if not found then
    return jsonb_build_object('success', false, 'error', 'SKU not found');
  end if;
  return jsonb_build_object('success', true);
end;
$$;