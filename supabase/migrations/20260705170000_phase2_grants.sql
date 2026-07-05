grant select on public.profiles to anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
grant select on public.teams to anon, authenticated;
grant select on public.team_members to anon, authenticated;