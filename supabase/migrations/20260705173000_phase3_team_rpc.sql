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

revoke execute on function public.create_team_with_manager(uuid, text) from public;
grant execute on function public.create_team_with_manager(uuid, text) to authenticated;
