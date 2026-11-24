-- ============================================================
-- Easy Gold Merch — 0029: CS items keep the MKT photo in sync
-- ============================================================
-- Fixes: "SKUs transferred from MKT stock show no picture in the CS list"
-- (broken-image icon).
--
-- Cause: every MKT -> CS path (transfer_mkt_to_cs, ticket fulfilment, admin
-- edits) copies `skus.image_url` into `cs_skus.image_url` ONCE, when the CS item
-- is first created. Those items were transferred while MKT photos were still
-- Google Drive links. The MKT photos were later re-uploaded to Supabase Storage
-- (sku-images bucket), but the CS copies were never updated. They still point
-- at `drive.google.com/uc?id=...`, which Google no longer serves as an
-- embeddable image, so the browser shows a broken image.
--
-- Fix:
--   1. Backfill: every CS item that shares its id with an MKT item and has no
--      photo, or a Google Drive photo, takes the MKT photo.
--   2. Trigger: when an MKT photo changes, the paired CS item (same id) follows,
--      unless CS has its own photo (one that differs from the old MKT photo and
--      is not a dead Drive link).
--
-- Hand-made CS items (`CS-SKU-...` ids) have no MKT twin and are untouched.
-- Idempotent. Paste into the Supabase SQL Editor and run.
-- ============================================================

-- 1. Backfill stale / missing CS photos from MKT
update public.cs_skus c
   set image_url = s.image_url
  from public.skus s
 where s.id = c.id
   and nullif(btrim(coalesce(s.image_url, '')), '') is not null
   and (c.image_url is null
        or btrim(c.image_url) = ''
        or c.image_url ilike '%drive.google.com%')
   and c.image_url is distinct from s.image_url;

-- 2. Keep the CS photo in step with future MKT photo changes
create or replace function public.sync_cs_sku_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.image_url is distinct from old.image_url then
    update public.cs_skus c
       set image_url = new.image_url
     where c.id = new.id
       and (c.image_url is null
            or btrim(c.image_url) = ''
            or c.image_url is not distinct from old.image_url
            or c.image_url ilike '%drive.google.com%');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_cs_sku_photo on public.skus;
create trigger trg_sync_cs_sku_photo
  after update of image_url on public.skus
  for each row execute function public.sync_cs_sku_photo();

-- Check: should return 0 rows after running
-- select c.id, c.name, c.image_url
--   from public.cs_skus c
--  where c.image_url ilike '%drive.google.com%';
