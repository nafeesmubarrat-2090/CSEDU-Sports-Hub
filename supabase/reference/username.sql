-- =========================================================================
-- USERNAMES — mutable, unique, non-null handle for every profile
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: the column add is guarded, the backfill only touches NULLs,
-- and every function/grant is create-or-replace / idempotent.
--
-- Context: profiles are auto-created on first Google sign-in (handle_new_user).
-- Until now they only had full_name/email. This adds a `username` handle that:
--   * is allocated automatically on first sign-in (derived from the email),
--   * can be changed by the user at will (via set_username RPC),
--   * is NOT NULL and unique case-insensitively (handle-style).
-- =========================================================================

-- ---------- 1. Column (nullable for now so we can backfill) ----------
alter table public.profiles add column if not exists username text;

-- ---------- 2. Handle generator ----------
-- Sanitize an arbitrary seed (usually the email local-part or full_name) into a
-- valid base handle, then append a numeric suffix until it is free
-- (case-insensitively). `exclude_id` lets set_username ignore the caller's own row.
create or replace function public.generate_unique_username(seed text, exclude_id uuid default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 0;
begin
  -- lower-case, keep only [a-z0-9_.], collapse repeats of separators.
  base := lower(coalesce(seed, ''));
  base := regexp_replace(base, '[^a-z0-9_.]+', '', 'g');
  base := regexp_replace(base, '[._]{2,}', '_', 'g');
  base := trim(both '._' from base);

  -- Enforce the min/max length of the format constraint below.
  if length(base) < 3 then
    base := base || 'user';
  end if;
  base := left(base, 30);

  candidate := base;
  loop
    exit when not exists (
      select 1 from public.profiles
      where lower(username) = lower(candidate)
        and (exclude_id is null or id <> exclude_id)
    );
    n := n + 1;
    -- keep the whole thing within 30 chars even after the suffix.
    candidate := left(base, 30 - length(n::text)) || n::text;
  end loop;

  return candidate;
end;
$$;

-- ---------- 3. Backfill existing rows (only those still NULL) ----------
do $$
declare
  r record;
begin
  for r in select id, email, full_name from public.profiles where username is null loop
    update public.profiles
      set username = public.generate_unique_username(
        coalesce(split_part(r.email, '@', 1), r.full_name, 'user'), r.id)
      where id = r.id;
  end loop;
end;
$$;

-- ---------- 4. Constraints: format, uniqueness, NOT NULL ----------
alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z0-9_.]{3,30}$');

-- Case-insensitive uniqueness.
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles alter column username set not null;

-- ---------- 5. Allocate a username on first sign-in ----------
-- Replaces the original handle_new_user() to also seed a unique username.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Unnamed');

  insert into public.profiles (id, full_name, email, avatar_url, username)
  values (
    new.id,
    display_name,
    new.email,
    new.raw_user_meta_data->>'avatar_url',
    public.generate_unique_username(coalesce(split_part(new.email, '@', 1), display_name, 'user'))
  );
  return new;
end;
$$;

-- ---------- 6. set_username RPC — the ONLY way clients change their handle ----------
-- Normalizes to lower-case, validates format, and enforces case-insensitive
-- uniqueness with a friendly error (instead of a raw unique-index violation).
create or replace function public.set_username(new_username text)
returns text language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  normalized text;
begin
  if caller is null then
    raise exception 'You must be signed in to change your username';
  end if;

  normalized := lower(trim(coalesce(new_username, '')));

  if normalized !~ '^[a-z0-9_.]{3,30}$' then
    raise exception 'Username must be 3-30 characters using only letters, numbers, dots, and underscores';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(username) = normalized and id <> caller
  ) then
    raise exception 'That username is already taken';
  end if;

  update public.profiles set username = normalized where id = caller;

  insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
  values (caller, 'SET_USERNAME', 'profiles', caller,
          jsonb_build_object('username', normalized));

  return normalized;
end;
$$;

-- ---------- 7. Grants ----------
-- Users may edit their handle only through set_username (direct column UPDATE on
-- username stays revoked, mirroring the global_role hardening in schema.sql).
grant execute on function public.set_username(text) to authenticated;
revoke execute on function public.generate_unique_username(text, uuid) from public;
