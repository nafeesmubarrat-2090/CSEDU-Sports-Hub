# Copilot instructions — CSE DU Sports Event Management System

## What this app does
A production system for running department sports tournaments transparently: event
proposals with admin approval, team rosters, brackets, a public budget ledger, and an
append-only activity log nobody (including admins) can edit.

Full detail lives in `docs/PROJECT_SPEC.md` and the canonical schema in
`supabase/schema.sql` — read the relevant section before implementing a feature rather
than guessing at the data model.

## Tech stack
- Next.js 14+ App Router, TypeScript, Tailwind CSS
- Supabase: Postgres + Auth (Google only) + Storage
- No Prisma, no custom REST API layer, no service role key in app code

## Non-obvious rules — read these before writing permission logic
- **Postgres is the real backend.** Row Level Security policies and `security definer`
  RPC functions in `supabase/schema.sql` are the actual permission boundary. Frontend
  role checks (`lib/permissions.ts`) only control what UI is shown — never treat them as
  the security layer.
- **Role/status changes go through RPCs, never direct `UPDATE`s:**
  `change_user_role(target_user, new_role)` and `approve_event(target_event)`. Both
  already enforce the hierarchy rules (admins can't demote other admins; the last
  `event_manager` can't be removed) and write their own audit log entry.
- **`budget_entries` and `audit_log` have no UPDATE/DELETE policy on purpose.**
  Corrections are new rows, not edits. Don't add an edit/delete UI for either.
- **Don't use the Supabase service role key.** Every privileged action in this app is
  handled by a `security definer` function that checks the caller's own role — the
  logged-in user's session is enough.
- **`player` is not a role column** — it's derived from having a `team_members` row with
  `role = 'player'`. Don't add a `player` value to the `app_role` enum unless the spec
  changes.

## Conventions
- Server Components fetch data directly via the Supabase server client; don't build
  Route Handlers for plain reads.
- Server Actions wrap privileged RPC calls and file-related work only.
- Every new table needs an RLS policy before it ships — no table stays with RLS
  disabled, ever, including "internal" ones.
