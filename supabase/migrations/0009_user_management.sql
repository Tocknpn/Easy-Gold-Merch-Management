-- ============================================================
-- Easy Gold Merch — 0009: Admin user management
--   add / edit / activate-inactivate / set password / delete
-- Run AFTER 0008_workflow_hardening.sql — SAFE TO RE-RUN.
-- ============================================================
--
-- WHAT THIS DOES
--  1. Stores the login password on public.users so an Admin can SEE
--     the password of every user in System Settings → Users.
--     (The password is ALSO hashed into auth.users.encrypted_password —
--      that hash is what actually authenticates the sign-in.)
--  2. Keeps that column OUT of normal client queries: `select password
--     from users` is denied for the `authenticated` role. Admins read it
--     on demand through the reveal_user_password() RPC instead.
--  3. Adds the manage_user() RPC that powers the Users tab:
--       add | update | set_password | set_status | delete
--     The caller is resolved from the signed-in JWT (never trusted from
--     the request body) and must be an Admin.
--
--  ⚠ Re-run this file if you ever re-run 0006_ensure_reads.sql, because
--    that migration re-grants table-level SELECT on every public table.
-- ============================================================

-- ------------------------------------------------------------------
-- 1. Password + audit columns on public.users
-- ------------------------------------------------------------------
alter table public.users add column if not exists password text;
alter table public.users add column if not exists password_updated_at timestamptz;
alter table public.users add column if not exists updated_at timestamptz default now();

-- bcrypt() lives in pgcrypto (Supabase ships it in the `extensions` schema)
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------
-- 2. Column-level security — the password never reaches a normal client
--    (RLS policies are row-level only, so privileges do the guarding).
-- ------------------------------------------------------------------
revoke select on public.users from authenticated;
grant  select (id, username, email, full_name, department, role, status) on public.users to authenticated;

-- Realtime broadcasts raw WAL rows, so keep users out of the publication.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
  ) then
    execute 'alter publication supabase_realtime drop table public.users';
  end if;
exception when others then null;
end $$;

-- ------------------------------------------------------------------
-- 3. Who is calling?  (same resolution 0008 uses: JWT uuid → public.users)
-- ------------------------------------------------------------------
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select u.role
    from public.users u
   where u.id = auth.uid()
      or lower(u.email) = lower(auth.email())
   order by (u.id = auth.uid()) desc
   limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role(), '') = 'admin';
$$;

-- ------------------------------------------------------------------
-- 4. manage_user — the single entry point for the Users tab
--    p_action: 'add' | 'update' | 'set_password' | 'set_status' | 'delete'
-- ------------------------------------------------------------------
create or replace function public.manage_user(
  p_action text,
  p_user   jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_id          uuid;
  v_email       text;
  v_password    text;
  v_status      text;
  v_role        text;
  v_old_email   text;
  v_old_role    text;
  v_old_status  text;
  v_admin_count integer;
  v_self        boolean;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false,
      'error', 'Only an Admin can manage users. Sign in with an Admin account.');
  end if;

  --  ADD ──────────────────────────────────────────────────────────
  if p_action = 'add' then
    v_email    := lower(trim(coalesce(p_user->>'email', '')));
    v_password := nullif(p_user->>'password', '');
    v_role     := nullif(trim(coalesce(p_user->>'role', '')), '');
    -- Canonicalize the role so it is always stored consistently with the
    -- format the app and update_ticket_status expect (lowercase snake_case).
    v_role := case lower(btrim(coalesce(v_role, '')))
      when 'warehouse manager' then 'warehouse'
      when 'line manager'      then 'line_manager'
      when 'customer service'  then 'customer_service'
      when 'staff','warehouse','line_manager','director','admin',
           'finance','customer_service','hr','pa' then lower(btrim(v_role))
      else null
    end;

    if v_email = '' or position('@' in v_email) = 0 then
      return jsonb_build_object('success', false, 'error', 'A valid email address is required');
    end if;
    if v_password is null or length(v_password) < 6 then
      return jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters');
    end if;
    if exists (select 1 from public.users where lower(email) = v_email) then
      return jsonb_build_object('success', false, 'error', 'A user with this email already exists');
    end if;

    v_id := gen_random_uuid();

    -- a) the Supabase Auth account — this is what the sign-in uses
    begin
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_email, crypt(v_password, gen_salt('bf')), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object(
          'full_name', coalesce(nullif(p_user->>'full_name', ''), v_email),
          'role', coalesce(v_role, 'staff')),
        now(), now(), '', '', '', ''
      );
    exception when insufficient_privilege then
      return jsonb_build_object('success', false,
        'error', 'No permission to create the Supabase Auth login (auth.users). '
                 || 'Re-run 0009_user_management.sql while signed in to the Supabase SQL Editor as the project owner.');
    end;

    -- b) the email identity row (newer GoTrue versions expect it)
    begin
      insert into auth.identities
        (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values
        (v_id, v_id,
         jsonb_build_object('sub', v_id::text, 'email', v_email,
                            'email_verified', true, 'phone_verified', false),
         'email', v_id::text, now(), now(), now());
    exception when others then
      begin
        insert into auth.identities
          (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values
          (v_id, v_id,
           jsonb_build_object('sub', v_id::text, 'email', v_email,
                              'email_verified', true, 'phone_verified', false),
           'email', now(), now(), now());
      exception when others then null;
      end;
    end;

    -- c) the application profile (with the visible password)
    insert into public.users
      (id, username, email, full_name, department, role, status,
       password, password_updated_at, updated_at)
    values
      (v_id,
       coalesce(nullif(p_user->>'username', ''), v_email),
       v_email,
       coalesce(nullif(p_user->>'full_name', ''), v_email),
       coalesce(p_user->>'department', ''),
       coalesce(v_role, 'staff'),
       'Active',
       v_password, now(), now());

    return jsonb_build_object('success', true, 'id', v_id, 'message', 'User created');
  end if;
-- ── every other action works on an existing user ─────────────────
  begin
    v_id := (p_user->>'id')::uuid;
  exception when others then
    v_id := null;
  end;
  if v_id is null then
    return jsonb_build_object('success', false, 'error', 'A user id is required');
  end if;

  select email, role, status into v_old_email, v_old_role, v_old_status
    from public.users where id = v_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'User not found');
  end if;

  v_self := (v_id = auth.uid()) or (lower(v_old_email) = lower(auth.email()));

  -- Canonicalize a role provided on update (matches the add branch).
  v_role := nullif(trim(coalesce(p_user->>'role', '')), '');
  v_role := case lower(btrim(coalesce(v_role, '')))
    when 'warehouse manager' then 'warehouse'
    when 'line manager'      then 'line_manager'
    when 'customer service'  then 'customer_service'
    when 'staff','warehouse','line_manager','director','admin',
         'finance','customer_service','hr','pa' then lower(btrim(v_role))
    else null
  end;

  if p_action = 'update' then
    if v_self and v_old_role = 'admin'
       and coalesce(nullif(p_user->>'role', ''), v_old_role) <> 'admin' then
      return jsonb_build_object('success', false,
        'error', 'You cannot remove your own Admin role');
    end if;
    if v_self and coalesce(nullif(p_user->>'status', ''), v_old_status) <> v_old_status then
      return jsonb_build_object('success', false,
        'error', 'You cannot change your own account status');
    end if;

    v_email := nullif(lower(trim(coalesce(p_user->>'email', ''))), '');

    if v_email is not null and v_email <> lower(v_old_email) then
      if position('@' in v_email) = 0 then
        return jsonb_build_object('success', false, 'error', 'A valid email address is required');
      end if;
      if exists (select 1 from public.users where lower(email) = v_email and id <> v_id) then
        return jsonb_build_object('success', false, 'error', 'Another user already uses ' || v_email);
      end if;
      update public.users set email = v_email where id = v_id;
      begin
        update auth.users
           set email = v_email,
               email_confirmed_at = coalesce(email_confirmed_at, now()),
               updated_at = now()
         where id = v_id;
      exception when others then null; end;
      begin
        update auth.identities
           set identity_data = jsonb_set(coalesce(identity_data, '{}'::jsonb),
                                         '{email}', to_jsonb(v_email))
         where user_id = v_id and provider = 'email';
      exception when others then null; end;
    end if;

    update public.users
       set username   = coalesce(nullif(p_user->>'username', ''), username),
           full_name  = coalesce(nullif(p_user->>'full_name', ''), full_name),
           department = coalesce(p_user->>'department', department),
           role       = coalesce(v_role, role),
           status     = coalesce(nullif(p_user->>'status', ''), status),
           updated_at = now()
     where id = v_id;

    return jsonb_build_object('success', true, 'id', v_id, 'message', 'User updated');

  elsif p_action = 'set_password' then
    v_password := nullif(p_user->>'password', '');
    if v_password is null or length(v_password) < 6 then
      return jsonb_build_object('success', false, 'error', 'Password must be at least 6 characters');
    end if;

    -- 1) Auth hash first: if this fails we abort BEFORE touching public.users,
    --    so the stored password and the real sign-in password can never drift.
    begin
      update auth.users
         set encrypted_password = crypt(v_password, gen_salt('bf')),
             updated_at = now()
       where id = v_id;
    exception when insufficient_privilege then
      return jsonb_build_object('success', false,
        'error', 'No permission to update the Supabase Auth login (auth.users). '
                 || 'Re-run 0009_user_management.sql as the project owner.');
    end;

    -- 2) the visible copy
    update public.users
       set password = v_password, password_updated_at = now(), updated_at = now()
     where id = v_id;

    -- force the user to sign in again with the new password
    begin
      delete from auth.sessions where user_id = v_id;
    exception when others then null; end;
    begin
      delete from auth.refresh_tokens where user_id = v_id::text;
    exception when others then null; end;

    return jsonb_build_object('success', true, 'id', v_id, 'message', 'Password updated');

  elsif p_action = 'set_status' then
    v_status := case when lower(coalesce(p_user->>'status', '')) = 'inactive'
                     then 'Inactive' else 'Active' end;

    if v_self and v_status = 'Inactive' then
      return jsonb_build_object('success', false, 'error', 'You cannot deactivate your own account');
    end if;
    if v_status = 'Inactive' and v_old_role = 'admin' then
      select count(*) into v_admin_count
        from public.users
       where role = 'admin' and status = 'Active' and id <> v_id;
      if v_admin_count = 0 then
        return jsonb_build_object('success', false, 'error', 'At least one active Admin must remain');
      end if;
    end if;

    update public.users set status = v_status, updated_at = now() where id = v_id;
    begin
      update auth.users
         set banned_until = case when v_status = 'Inactive'
                                 then now() + interval '100 years'
                                 else null end,
             updated_at = now()
       where id = v_id;
    exception when others then null; end;

    if v_status = 'Inactive' then
      begin
        delete from auth.sessions where user_id = v_id;
      exception when others then null; end;
    end if;

    return jsonb_build_object('success', true, 'id', v_id, 'status', v_status,
      'message', 'User ' || lower(v_status));

  elsif p_action = 'delete' then
    if v_self then
      return jsonb_build_object('success', false, 'error', 'You cannot delete your own account');
    end if;
    if v_old_role = 'admin' then
      select count(*) into v_admin_count from public.users where role = 'admin' and id <> v_id;
      if v_admin_count = 0 then
        return jsonb_build_object('success', false, 'error', 'At least one Admin must remain');
      end if;
    end if;

    delete from public.users where id = v_id;
    begin
      delete from auth.sessions where user_id = v_id;
    exception when others then null; end;
    begin
      delete from auth.identities where user_id = v_id;
    exception when others then null; end;
    begin
      delete from auth.users where id = v_id;
    exception when others then null; end;

    return jsonb_build_object('success', true, 'id', v_id, 'message', 'User deleted');
  end if;

  return jsonb_build_object('success', false,
    'error', 'Unknown action: ' || coalesce(p_action, '(null)'));
end;
$$;
-- ------------------------------------------------------------------
-- 5. reveal_user_password — Admin-only read of the stored password
-- ------------------------------------------------------------------
create or replace function public.reveal_user_password(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_password text;
begin
  if not public.is_admin() then
    return jsonb_build_object('success', false, 'error', 'Only an Admin can view passwords');
  end if;

  select password into v_password from public.users where id = p_user_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'User not found');
  end if;

  return jsonb_build_object(
    'success', true,
    'password', coalesce(v_password, ''),
    'has_password', v_password is not null);
end;
$$;

-- ------------------------------------------------------------------
-- 6. Permissions — new functions default to EXECUTE for PUBLIC, so
--    lock them down and open them for signed-in users only.
-- ------------------------------------------------------------------
revoke execute on function public.current_app_role()        from public, anon;
revoke execute on function public.is_admin()                from public, anon;
revoke execute on function public.manage_user(text, jsonb)  from public, anon;
revoke execute on function public.reveal_user_password(uuid) from public, anon;

grant execute on function public.manage_user(text, jsonb)    to authenticated;
grant execute on function public.reveal_user_password(uuid)  to authenticated;