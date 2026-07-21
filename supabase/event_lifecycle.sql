-- =========================================================================
-- EVENT LIFECYCLE STATUS — upcoming / ongoing / completed / cancelled
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: enum creation and the column add are both guarded.
--
-- This is DISTINCT from events.status (the approval workflow:
-- pending/approved/rejected/completed, which gates public visibility via RLS).
-- `lifecycle` describes where the event is in its real-world run and is set by
-- the event's managers or an admin. No new RLS is needed: the existing
-- "events_update_managers_only" policy already restricts writes to managers/admins.
-- =========================================================================

-- Enum: create only if it does not already exist.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_lifecycle') then
    create type event_lifecycle as enum ('upcoming', 'ongoing', 'completed', 'cancelled');
  end if;
end
$$;

-- Column: default 'upcoming', never null. Add only if missing.
alter table public.events
  add column if not exists lifecycle event_lifecycle not null default 'upcoming';
