-- ============================================================
-- 0011_normalize_roles.sql
-- Canonicalize public.users.role values.
--
-- The seed / legacy users stored title-case and spaced role labels
-- ('Warehouse', 'Line Manager', 'Director', 'Admin', 'Staff', 'HR',
--  'PA', ...) while the app (roleFromRaw) and the SQL engine
-- (update_ticket_status) compare against stable lowercase snake_case
-- values ('warehouse', 'line_manager', 'director', 'admin', ...).
-- This mismatch caused genuine approvers to be rejected with
-- "Not authorized: Warehouse cannot reviewed", etc.
--
-- This migration normalizes existing rows to the canonical format so
-- the stored data matches what the app and engine expect. It also
-- re-asserts a normalization trigger-independent guarantee: any future
-- writes go through manage_user() which now canonicalizes the role too.
-- ============================================================

begin;

update public.users
   set role = case lower(btrim(role))
     when 'warehouse manager' then 'warehouse'
     when 'line manager'      then 'line_manager'
     when 'customer service'  then 'customer_service'
     when 'staff','warehouse','line_manager','director','admin',
          'finance','customer_service','hr','pa' then lower(btrim(role))
     else 'staff'
   end;

commit;