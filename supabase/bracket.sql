-- =========================================================================
-- BRACKET RPCs — single-elimination knockout support
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: every function is `create or replace` and grants are idempotent.
--
-- What these give you:
--   generate_bracket(event, size)      build an empty power-of-2 tree (2..32)
--   assign_team_to_slot(match, slot, team)  drop a team into an empty A/B slot
--   promote_bye(match, team)           advance a team with no opponent (auto-promotion)
--   report_match_result(match, winner, score_a, score_b)  record result + advance winner
--
-- All four enforce event-manager/admin permission internally (second layer on top of
-- RLS) and rely on the existing audit_matches trigger for logging.
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
