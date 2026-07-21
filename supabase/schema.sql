-- =========================================================================
-- CSE DU Sports Event Management — Database Schema
-- Paste this into the Supabase SQL Editor (or run via `supabase db push`)
-- Run top to bottom, once, on a fresh project.
-- =========================================================================

-- ---------- Extensions ----------
create extension if not exists "uuid-ossp";

-- ---------- Enums ----------
create type app_role as enum ('admin', 'event_manager', 'user');
create type event_status as enum ('pending', 'approved', 'rejected', 'completed');
-- Real-world run state, set by the event's managers/admin (distinct from the approval workflow above).
create type event_lifecycle as enum ('upcoming', 'ongoing', 'completed', 'cancelled');
create type team_member_role as enum ('manager', 'player');
create type budget_entry_type as enum ('income', 'expense');
create type match_status as enum ('scheduled', 'in_progress', 'completed');

-- =========================================================================
-- TABLES
-- =========================================================================

-- One row per authenticated person. Auto-created on first Google sign-in (see trigger below).
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  avatar_url text,
  global_role app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  sport text,
  status event_status not null default 'pending',
  lifecycle event_lifecycle not null default 'upcoming',
  created_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  start_date date,
  end_date date,
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who actively manages a given event. Usually just the creator; admins can add co-managers.
create table public.event_managers (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.teams (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  logo_url text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Both team managers and players live here, distinguished by `role`.
create table public.team_members (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role team_member_role not null default 'player',
  jersey_number int,
  position text,
  added_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- Bracket structure. next_match_id lets you build a single-elimination tree.
create table public.matches (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  round int not null,
  match_number int not null,
  team_a_id uuid references public.teams(id),
  team_b_id uuid references public.teams(id),
  team_a_score int,
  team_b_score int,
  winner_id uuid references public.teams(id),
  status match_status not null default 'scheduled',
  scheduled_at timestamptz,
  next_match_id uuid references public.matches(id),
  created_at timestamptz not null default now()
);

-- Per-match player stats — this is the source table for the Top Performers page.
create table public.player_stats (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  points int not null default 0,
  goals int not null default 0,
  assists int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- Income + expense ledger. Deliberately has no UPDATE/DELETE policy (see RLS below) —
-- corrections are made by adding a new offsetting entry, never by editing history.
-- This is what makes the budget page provable, not just trusted.
create table public.budget_entries (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  type budget_entry_type not null,
  label text not null,
  amount numeric(12,2) not null check (amount >= 0),
  proof_url text,
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Append-only. Nobody — including admins — can UPDATE or DELETE rows here (enforced below).
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,          -- INSERT / UPDATE / DELETE / APPROVE / ROLE_CHANGE / ...
  table_name text not null,
  record_id uuid,
  event_id uuid references public.events(id),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

-- =========================================================================
-- AUTO-PROVISION A PROFILE ON SIGNUP
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Unnamed'),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- ROLE / PERMISSION HELPERS (used inside RLS policies below)
-- =========================================================================
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and global_role = 'admin');
$$;

create or replace function public.is_event_manager_of(uid uuid, eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin(uid) or exists (
    select 1 from public.event_managers where event_id = eid and user_id = uid
  );
$$;

create or replace function public.is_team_manager_of(uid uuid, tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where team_id = tid and user_id = uid and role = 'manager'
  ) or exists (
    select 1 from public.teams t
    where t.id = tid and public.is_event_manager_of(uid, t.event_id)
  );
$$;

-- =========================================================================
-- BUSINESS-RULE RPCs
-- Client code calls these via supabase.rpc(...) instead of raw UPDATEs.
-- Each one enforces your exact hierarchy rules atomically, then logs itself.
-- =========================================================================

-- Admin changes someone's global role. Enforces: only admins call this; admins can only
-- demote themselves (never another admin); the last remaining event_manager can't be removed.
create or replace function public.change_user_role(target_user uuid, new_role app_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_role app_role;
  target_role app_role;
  manager_count int;
begin
  select global_role into caller_role from public.profiles where id = caller;
  if caller_role <> 'admin' then
    raise exception 'Only admins can change roles';
  end if;

  select global_role into target_role from public.profiles where id = target_user;

  if target_role = 'admin' and new_role <> 'admin' and target_user <> caller then
    raise exception 'Admins cannot demote other admins — only self-demotion is allowed';
  end if;

  if target_role = 'event_manager' and new_role <> 'event_manager' then
    select count(*) into manager_count from public.profiles where global_role = 'event_manager';
    if manager_count <= 1 then
      raise exception 'Cannot remove the last remaining event manager';
    end if;
  end if;

  update public.profiles set global_role = new_role where id = target_user;

  insert into public.audit_log (actor_id, action, table_name, record_id, new_data)
  values (caller, 'ROLE_CHANGE', 'profiles', target_user, jsonb_build_object('new_role', new_role));
end;
$$;

-- Admin approves a pending event. The creator becomes its manager and, if they were a
-- plain 'user', is bumped to the global 'event_manager' role.
create or replace function public.approve_event(target_event uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  caller_role app_role;
  creator uuid;
  creator_role app_role;
begin
  select global_role into caller_role from public.profiles where id = caller;
  if caller_role <> 'admin' then
    raise exception 'Only admins can approve events';
  end if;

  select created_by into creator from public.events where id = target_event;
  select global_role into creator_role from public.profiles where id = creator;

  update public.events
    set status = 'approved', approved_by = caller, updated_at = now()
    where id = target_event;

  insert into public.event_managers (event_id, user_id, assigned_by)
  values (target_event, creator, caller)
  on conflict do nothing;

  if creator_role = 'user' then
    update public.profiles set global_role = 'event_manager' where id = creator;
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, event_id, new_data)
  values (caller, 'APPROVE', 'events', target_event, target_event, jsonb_build_object('status', 'approved'));
end;
$$;

-- Optional nice-to-have: an existing manager of an event (or an admin) can add a co-manager
-- to that specific event, without granting them the global event_manager role.
create or replace function public.add_event_manager(target_event uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  ev_status event_status;
  target_role app_role;
begin
  if not public.is_event_manager_of(caller, target_event) then
    raise exception 'Only admins or this event''s managers can add co-managers';
  end if;

  select status into ev_status from public.events where id = target_event;
  if ev_status is distinct from 'approved' then
    raise exception 'Managers can only be assigned to approved events';
  end if;

  select global_role into target_role from public.profiles where id = target_user;
  if target_role not in ('event_manager', 'admin') then
    raise exception 'Only users with the event_manager role can be assigned to events';
  end if;

  insert into public.event_managers (event_id, user_id, assigned_by)
  values (target_event, target_user, caller)
  on conflict do nothing;

  insert into public.audit_log (actor_id, action, table_name, record_id, event_id, new_data)
  values (caller, 'ADD_EVENT_MANAGER', 'event_managers', target_user, target_event,
          jsonb_build_object('user_id', target_user));
end;
$$;

-- Remove a manager from a specific event. Admin or one of the event's managers may
-- call it. Guard: an event must always keep at least one manager, so the last
-- remaining manager of an event cannot be removed.
create or replace function public.remove_event_manager(target_event uuid, target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  is_manager boolean;
  manager_count int;
begin
  if not public.is_event_manager_of(caller, target_event) then
    raise exception 'Only admins or this event''s managers can remove co-managers';
  end if;

  select exists (
    select 1 from public.event_managers
    where event_id = target_event and user_id = target_user
  ) into is_manager;

  -- Nothing to remove; treat as a no-op so the guard below can't misfire.
  if not is_manager then
    return;
  end if;

  select count(*) into manager_count
    from public.event_managers where event_id = target_event;

  if manager_count <= 1 then
    raise exception 'Cannot remove the last remaining manager of this event';
  end if;

  delete from public.event_managers
    where event_id = target_event and user_id = target_user;

  insert into public.audit_log (actor_id, action, table_name, record_id, event_id, new_data)
  values (caller, 'REMOVE_EVENT_MANAGER', 'event_managers', target_user, target_event,
          jsonb_build_object('user_id', target_user));
end;
$$;

-- Create a team and immediately add the creator as its manager.
create or replace function public.create_team_with_manager(target_event uuid, team_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  new_team_id uuid;
begin
  if caller is null then
    raise exception 'You must be signed in to create a team';
  end if;

  if nullif(trim(team_name), '') is null then
    raise exception 'Team name cannot be empty';
  end if;

  insert into public.teams (event_id, name, created_by)
  values (target_event, trim(team_name), caller)
  returning id into new_team_id;

  insert into public.team_members (team_id, user_id, role, added_by)
  values (new_team_id, caller, 'manager', caller);

  return new_team_id;
end;
$$;

-- =========================================================================
-- AUTOMATIC AUDIT TRIGGERS
-- Every insert/update/delete on the tables below is logged with no app code involved.
-- Split into three variants because they differ in how they find `event_id`.
-- =========================================================================

-- For `events` itself: its own id IS the event_id.
create or replace function public.log_activity_events()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, event_id, old_data, new_data)
  values (
    auth.uid(), tg_op, 'events',
    coalesce(new.id, old.id), coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

-- For tables that carry an event_id column directly (teams, matches, budget_entries).
create or replace function public.log_activity_with_event_id()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor_id, action, table_name, record_id, event_id, old_data, new_data)
  values (
    auth.uid(), tg_op, tg_table_name,
    coalesce(new.id, old.id), coalesce(new.event_id, old.event_id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

-- For team_members, which only has team_id — look up the event through teams.
create or replace function public.log_activity_team_members()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
begin
  select event_id into eid from public.teams where id = coalesce(new.team_id, old.team_id);
  insert into public.audit_log (actor_id, action, table_name, record_id, event_id, old_data, new_data)
  values (
    auth.uid(), tg_op, 'team_members',
    coalesce(new.id, old.id), eid,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_events  after insert or update or delete on public.events         for each row execute function public.log_activity_events();
create trigger audit_teams   after insert or update or delete on public.teams          for each row execute function public.log_activity_with_event_id();
create trigger audit_matches after insert or update or delete on public.matches        for each row execute function public.log_activity_with_event_id();
create trigger audit_budget  after insert or update or delete on public.budget_entries for each row execute function public.log_activity_with_event_id();
create trigger audit_members after insert or update or delete on public.team_members   for each row execute function public.log_activity_team_members();

-- Lock the audit_log table itself. This fires regardless of who's calling — admin included.
create or replace function public.block_audit_log_tamper()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_log rows cannot be updated or deleted';
end;
$$;

create trigger no_tamper_audit_log
  before update or delete on public.audit_log
  for each row execute function public.block_audit_log_tamper();

-- =========================================================================
-- ROW LEVEL SECURITY — this is the actual security boundary, not the frontend.
-- =========================================================================
alter table public.profiles       enable row level security;
alter table public.events         enable row level security;
alter table public.event_managers enable row level security;
alter table public.teams          enable row level security;
alter table public.team_members   enable row level security;
alter table public.matches        enable row level security;
alter table public.player_stats   enable row level security;
alter table public.budget_entries enable row level security;
alter table public.audit_log      enable row level security;

-- profiles: readable by everyone (names/avatars are not secret); a user may edit their
-- own display fields, but NOT their own global_role (see column-level grant below).
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_self" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- events: approved events are public; pending/rejected are visible only to their creator
-- and admins. Only that event's managers (or an admin) may update it.
create policy "events_select" on public.events for select
  using (status = 'approved' or public.is_admin(auth.uid()) or created_by = auth.uid());
create policy "events_insert_any_logged_in_user" on public.events for insert
  with check (auth.uid() = created_by);
create policy "events_update_managers_only" on public.events for update
  using (public.is_event_manager_of(auth.uid(), id));

-- teams: public read; any logged-in user may create one (becoming its manager via
-- team_members insert done client-side in the same transaction/RPC).
create policy "teams_select_public" on public.teams for select using (true);
create policy "teams_insert_any_logged_in_user" on public.teams for insert
  with check (auth.uid() = created_by);
create policy "teams_update_managers" on public.teams for update
  using (public.is_team_manager_of(auth.uid(), id) or public.is_event_manager_of(auth.uid(), event_id));

-- team_members: public read (rosters are public); writes restricted to that team's
-- manager or the event's manager/admin (tier inheritance).
create policy "team_members_select_public" on public.team_members for select using (true);
create policy "team_members_insert_managers" on public.team_members for insert
  with check (
    public.is_team_manager_of(auth.uid(), team_id)
    or public.is_event_manager_of(auth.uid(), (select event_id from public.teams where id = team_id))
  );
create policy "team_members_update_managers" on public.team_members for update
  using (
    public.is_team_manager_of(auth.uid(), team_id)
    or public.is_event_manager_of(auth.uid(), (select event_id from public.teams where id = team_id))
  );
create policy "team_members_delete_managers" on public.team_members for delete
  using (
    public.is_team_manager_of(auth.uid(), team_id)
    or public.is_event_manager_of(auth.uid(), (select event_id from public.teams where id = team_id))
  );

-- matches + player_stats: public read (brackets and stats are the whole point), writes
-- restricted to that event's managers/admin.
create policy "matches_select_public" on public.matches for select using (true);
create policy "matches_write_event_managers" on public.matches for all
  using (public.is_event_manager_of(auth.uid(), event_id));

create policy "player_stats_select_public" on public.player_stats for select using (true);
create policy "player_stats_write_event_managers" on public.player_stats for all
  using (public.is_event_manager_of(auth.uid(), (select event_id from public.matches where id = match_id)));

-- budget_entries: public read for transparency. INSERT only — no update/delete policy
-- exists, so corrections must be new entries. This is deliberate, not an oversight.
create policy "budget_select_public" on public.budget_entries for select using (true);
create policy "budget_write_event_managers" on public.budget_entries for insert
  with check (public.is_event_manager_of(auth.uid(), event_id));

-- audit_log: readable by admins and that event's managers only. No insert/update/delete
-- policy for clients at all — rows only ever arrive via the triggers above.
create policy "audit_log_select_managers" on public.audit_log for select
  using (public.is_admin(auth.uid()) or (event_id is not null and public.is_event_manager_of(auth.uid(), event_id)));

-- event_managers: readable by everyone; no client insert policy — rows only arrive via
-- approve_event() / add_event_manager(), which run as security definer.
create policy "event_managers_select_public" on public.event_managers for select using (true);

-- =========================================================================
-- HARDENING: lock global_role at the column level.
-- Without this, a user could bypass RLS's row check and simply UPDATE their own
-- global_role via a direct client call, since "profiles_update_self" only checks
-- row ownership, not which columns changed. Supabase grants broad table access to
-- `authenticated` by default — RLS narrows rows, this narrows columns.
-- =========================================================================
grant select on public.profiles to anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.team_members to anon, authenticated;

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- =========================================================================
-- HARDENING: restrict who can even call the privileged RPCs.
-- (Each function still re-checks the caller's role internally — this is a second layer.)
-- =========================================================================
revoke execute on function public.change_user_role(uuid, app_role) from public;
grant execute on function public.change_user_role(uuid, app_role) to authenticated;

revoke execute on function public.approve_event(uuid) from public;
grant execute on function public.approve_event(uuid) to authenticated;

revoke execute on function public.add_event_manager(uuid, uuid) from public;
grant execute on function public.add_event_manager(uuid, uuid) to authenticated;

revoke execute on function public.remove_event_manager(uuid, uuid) from public;
grant execute on function public.remove_event_manager(uuid, uuid) to authenticated;

revoke execute on function public.create_team_with_manager(uuid, text) from public;
grant execute on function public.create_team_with_manager(uuid, text) to authenticated;

-- =========================================================================
-- BOOTSTRAP YOUR FIRST ADMIN
-- There's a chicken-and-egg problem: change_user_role requires an existing admin.
-- After you sign in for the first time, run this once in the SQL Editor, replacing
-- the email with your own:
-- =========================================================================
-- update public.profiles set global_role = 'admin' where email = 'you@example.com';

-- =========================================================================
-- BRACKET RPCs (single-elimination knockout) — see supabase/bracket.sql for the
-- standalone paste-and-run version. Kept here so schema.sql stays authoritative.
-- =========================================================================

-- Build an empty single-elimination bracket for `team_count` teams.
-- team_count must be a power of two between 2 and 32. WIPES all existing matches
-- (and their player_stats, via cascade) for the event before rebuilding.
create or replace function public.generate_bracket(target_event uuid, team_count int)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  total_rounds int := 0;
  tc int := team_count;
  mc int := 1;              -- matches in the round currently being built (starts at the final)
  r int;
  m int;
  nid uuid;
  new_id uuid;
  cur_ids uuid[];
  next_ids uuid[] := '{}';  -- ids of the round one step closer to the final
begin
  if not public.is_event_manager_of(caller, target_event) then
    raise exception 'Only this event''s managers or an admin can generate a bracket';
  end if;

  if team_count < 2 or team_count > 32 or (team_count & (team_count - 1)) <> 0 then
    raise exception 'Team count must be a power of two between 2 and 32 (got %)', team_count;
  end if;

  -- how many rounds does this size need? (32 -> 5, 16 -> 4, ... 2 -> 1)
  while tc > 1 loop
    tc := tc / 2;
    total_rounds := total_rounds + 1;
  end loop;

  -- clear any existing bracket for this event
  delete from public.matches where event_id = target_event;

  -- build from the final round down to round 1 so each child can point at an
  -- already-created parent via next_match_id
  for r in reverse total_rounds..1 loop
    cur_ids := '{}';
    for m in 1..mc loop
      if r = total_rounds then
        nid := null;                                  -- the final has no next match
      else
        nid := next_ids[ceil(m::numeric / 2)::int];   -- matches 1,2 -> parent 1; 3,4 -> parent 2 ...
      end if;

      insert into public.matches (event_id, round, match_number, next_match_id, status)
      values (target_event, r, m, nid, 'scheduled')
      returning id into new_id;

      cur_ids := array_append(cur_ids, new_id);
    end loop;

    next_ids := cur_ids;
    mc := mc * 2;
  end loop;
end;
$$;

-- Put a team into an empty A or B slot of a match. `slot` is 'a' or 'b'.
create or replace function public.assign_team_to_slot(target_match uuid, slot text, team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  eid uuid;
  m_status match_status;
  team_event uuid;
begin
  select event_id, status into eid, m_status from public.matches where id = target_match;
  if eid is null then
    raise exception 'Match not found';
  end if;
  if not public.is_event_manager_of(caller, eid) then
    raise exception 'Only this event''s managers or an admin can edit the bracket';
  end if;
  if m_status = 'completed' then
    raise exception 'Cannot change teams on a completed match';
  end if;

  select event_id into team_event from public.teams where id = team;
  if team_event is null or team_event <> eid then
    raise exception 'That team does not belong to this event';
  end if;

  if slot = 'a' then
    update public.matches set team_a_id = team where id = target_match;
  elsif slot = 'b' then
    update public.matches set team_b_id = team where id = target_match;
  else
    raise exception 'Slot must be "a" or "b" (got %)', slot;
  end if;
end;
$$;

-- Advance the current slot of `target_match` up to its parent (used by both
-- report_match_result and promote_bye). Even match numbers land in the parent's
-- B slot, odd numbers in the A slot.
create or replace function public.advance_winner(target_match uuid, winner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  parent uuid;
  m_number int;
begin
  select next_match_id, match_number into parent, m_number from public.matches where id = target_match;
  if parent is null then
    return;   -- this was the final; nothing to advance into
  end if;

  if m_number % 2 = 1 then
    update public.matches set team_a_id = winner where id = parent;
  else
    update public.matches set team_b_id = winner where id = parent;
  end if;
end;
$$;

-- Auto-promotion: advance a team that has no opponent (a bye) without playing.
create or replace function public.promote_bye(target_match uuid, team uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  eid uuid;
  a uuid;
  b uuid;
begin
  select event_id, team_a_id, team_b_id into eid, a, b from public.matches where id = target_match;
  if eid is null then
    raise exception 'Match not found';
  end if;
  if not public.is_event_manager_of(caller, eid) then
    raise exception 'Only this event''s managers or an admin can promote a team';
  end if;
  if team is null or (team <> a and team <> b) then
    raise exception 'The promoted team must be one of the teams in this match';
  end if;

  update public.matches
    set winner_id = team, status = 'completed'
    where id = target_match;

  perform public.advance_winner(target_match, team);
end;
$$;

-- Record a match result and advance the winner into the next round.
-- score_a / score_b are optional (pass null to record a winner with no score).
create or replace function public.report_match_result(
  target_match uuid,
  winner uuid,
  score_a int default null,
  score_b int default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  eid uuid;
  a uuid;
  b uuid;
begin
  select event_id, team_a_id, team_b_id into eid, a, b from public.matches where id = target_match;
  if eid is null then
    raise exception 'Match not found';
  end if;
  if not public.is_event_manager_of(caller, eid) then
    raise exception 'Only this event''s managers or an admin can report results';
  end if;
  if a is null or b is null then
    raise exception 'Both teams must be set before reporting a result (use auto-promote for a bye)';
  end if;
  if winner is null or (winner <> a and winner <> b) then
    raise exception 'The winner must be one of the two teams in this match';
  end if;

  update public.matches
    set team_a_score = score_a,
        team_b_score = score_b,
        winner_id = winner,
        status = 'completed'
    where id = target_match;

  perform public.advance_winner(target_match, winner);
end;
$$;

-- =========================================================================
-- Lock down execution to signed-in users (each function still re-checks the
-- caller's manager/admin status internally).
-- =========================================================================
revoke execute on function public.generate_bracket(uuid, int) from public;
grant  execute on function public.generate_bracket(uuid, int) to authenticated;

revoke execute on function public.assign_team_to_slot(uuid, text, uuid) from public;
grant  execute on function public.assign_team_to_slot(uuid, text, uuid) to authenticated;

revoke execute on function public.promote_bye(uuid, uuid) from public;
grant  execute on function public.promote_bye(uuid, uuid) to authenticated;

revoke execute on function public.report_match_result(uuid, uuid, int, int) from public;
grant  execute on function public.report_match_result(uuid, uuid, int, int) to authenticated;

-- advance_winner is an internal helper — no direct client access.
revoke execute on function public.advance_winner(uuid, uuid) from public;

-- =========================================================================
-- EVENT AWARDS — manager-curated recognitions (Top Scorer, MVP, etc.)
-- Canonical copy of supabase/awards.sql. A category + performer name + optional
-- detail, shown at the top of the Leaderboard page. Distinct from player_stats
-- (the auto-computed Top Performers table): awards are the curated, editorial
-- layer an event's managers/admin set by hand. Public read, managers/admin write.
-- Carries event_id directly, so it reuses log_activity_with_event_id for audit.
-- =========================================================================
create table if not exists public.event_awards (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null,          -- e.g. "Top Scorer", "MVP", "Best Goalkeeper"
  performer text not null,         -- free-text name of the person/team recognised
  detail text,                     -- optional extra line, e.g. "14 goals", team name
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.event_awards enable row level security;

drop policy if exists "event_awards_select_public" on public.event_awards;
create policy "event_awards_select_public" on public.event_awards for select using (true);

drop policy if exists "event_awards_write_event_managers" on public.event_awards;
create policy "event_awards_write_event_managers" on public.event_awards for all
  using (public.is_event_manager_of(auth.uid(), event_id))
  with check (public.is_event_manager_of(auth.uid(), event_id));

drop trigger if exists audit_awards on public.event_awards;
create trigger audit_awards after insert or update or delete on public.event_awards
  for each row execute function public.log_activity_with_event_id();
