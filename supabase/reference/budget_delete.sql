-- =========================================================================
-- Allow Event Managers and Admins to Delete Budget Entries
-- =========================================================================
-- Deletions are automatically tracked by the existing `audit_budget` trigger,
-- which logs the action, actor_id, and full JSON of the deleted entry
-- (including label, amount, type, and proof) to `public.audit_log`.
-- =========================================================================

-- 1. Ensure authenticated users have table-level delete permissions
grant delete on public.budget_entries to authenticated;

-- 2. Add Row Level Security (RLS) delete policy for event managers and admins
drop policy if exists "budget_delete_event_managers" on public.budget_entries;

create policy "budget_delete_event_managers" on public.budget_entries for delete
  using (public.is_event_manager_of(auth.uid(), event_id));
