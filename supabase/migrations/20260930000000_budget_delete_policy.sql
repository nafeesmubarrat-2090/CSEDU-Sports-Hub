-- Allow event managers and admins to delete budget entries
grant delete on public.budget_entries to authenticated;

drop policy if exists "budget_delete_event_managers" on public.budget_entries;

create policy "budget_delete_event_managers" on public.budget_entries for delete
  using (public.is_event_manager_of(auth.uid(), event_id));
