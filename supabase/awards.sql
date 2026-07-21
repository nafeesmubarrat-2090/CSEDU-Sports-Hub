-- =========================================================================
-- EVENT AWARDS — manager-curated recognitions (Top Scorer, MVP, etc.)
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: table/policy/trigger creation is all guarded.
--
-- These are the hand-picked awards shown at the top of the Leaderboard page.
-- A category ("Top Scorer") + a performer name + an optional detail line.
-- Distinct from player_stats (which is the auto-computed Top Performers table):
-- awards are the curated, editorial layer an event's managers/admin set by hand.
-- Writes are restricted to that event's managers/admin; everyone can read.
-- Carries event_id directly, so it reuses the existing log_activity_with_event_id
-- audit trigger — every insert/update/delete is logged with no app code.
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

-- Public read (the whole point is that users can see them), writes restricted to
-- that event's managers/admin — mirrors the matches policy.
drop policy if exists "event_awards_select_public" on public.event_awards;
create policy "event_awards_select_public" on public.event_awards for select using (true);

drop policy if exists "event_awards_write_event_managers" on public.event_awards;
create policy "event_awards_write_event_managers" on public.event_awards for all
  using (public.is_event_manager_of(auth.uid(), event_id))
  with check (public.is_event_manager_of(auth.uid(), event_id));

-- Automatic audit logging via the shared event_id-carrying trigger function.
drop trigger if exists audit_awards on public.event_awards;
create trigger audit_awards after insert or update or delete on public.event_awards
  for each row execute function public.log_activity_with_event_id();

-- Base table privileges. RLS only takes effect AFTER a role has table-level
-- access, so these grants are required — the policies above narrow them, they
-- do not replace them. Mirrors the grants in schema.sql / phase2_grants.
grant select on public.event_awards to anon, authenticated;
grant insert, update, delete on public.event_awards to authenticated;
