-- =========================================================================
-- ROLE MANAGEMENT — per-event manager assignment + removal
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: every function is create-or-replace and grants are idempotent.
--
-- Context: this project has TWO layers of "manager":
--   * profiles.global_role = 'event_manager'  — a global capability flag
--   * public.event_managers                    — WHICH events a person manages
-- The admin panel now assigns specific approved events to event managers and
-- can remove them, instead of only flipping the global role. The creator of an
-- approved event is already inserted into event_managers by approve_event(), so
-- they show up as managing their own event automatically.
-- =========================================================================

-- Harden add_event_manager: it now also enforces (as a second layer behind the
-- admin UI) that the event is approved and the target already holds the
-- event_manager (or admin) global role. Existing callers are unaffected because
-- approve_event() adds the creator AFTER bumping them to event_manager, and the
-- event is set to 'approved' in the same call.
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

-- Remove a manager from a specific event. Admin or one of the event's managers
-- may call it. Guard: an event must always keep at least one manager, so the
-- last remaining manager of an event cannot be removed.
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

-- Lock down the new RPC (each function still re-checks the caller internally).
revoke execute on function public.remove_event_manager(uuid, uuid) from public;
grant  execute on function public.remove_event_manager(uuid, uuid) to authenticated;
