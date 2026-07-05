# CSE DU Sports Event Management System — Project Specification

This is the source of truth for the project. Feed relevant sections of this file to
Copilot (or any AI coding tool) one phase at a time — don't paste the whole thing into
one prompt. `.github/copilot-instructions.md` is the short always-on summary; this file
is the detail it points to.

## 1. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14+ (App Router), TypeScript | Server + client components in one project, no separate backend server to run |
| Styling | Tailwind CSS | Fast to build with, easy for Copilot to generate correctly |
| Backend | Supabase (Postgres + Auth + Storage) | See §2 — Postgres itself does most of your "backend" work |
| Auth | Supabase Auth, Google provider only | Matches your "continue with Google" requirement exactly |
| ORM | None — `supabase-js` + generated TypeScript types | Prisma would fight with Row Level Security; typed Supabase client is the idiomatic choice here |
| File storage | Supabase Storage | Receipt/proof uploads, team logos, event covers |
| Hosting | Vercel (frontend) + Supabase Cloud (data) | Both have real free tiers; this is a legitimate production path, not a toy setup |

## 2. The core architectural idea — read this before writing any code

With a traditional stack you'd build a REST/GraphQL API server that sits between your
frontend and your database, and *that server* enforces permissions. With Supabase, the
database enforces its own permissions through **Row Level Security (RLS)**, and your
frontend talks to Postgres almost directly through `supabase-js`.

This means:

- **Postgres is your real backend.** `supabase/schema.sql` (already written for you)
  defines every table, every permission rule, and every business rule (like "an admin
  can't demote another admin") as SQL — RLS policies for simple row-visibility rules,
  and `security definer` RPC functions for anything with actual logic (counting,
  conditionals, multi-table writes).
- **Next.js server code is a thin layer, not a full API.** You'll still write a handful
  of Next.js Server Actions and Route Handlers, but only for things Postgres genuinely
  can't do: generating file-upload URLs, and any future email/notification sending.
  You will **not** write a `/api/events` CRUD controller — the frontend calls Supabase
  directly for that, and RLS decides what's allowed.
- **The frontend never enforces security, only convenience.** Hiding a button from a
  `user` role is a UX nicety. The actual gate is the RLS policy and the RPC's internal
  role check. If you only hide the button and skip the SQL policy, the system is not
  secure — someone could still call the Supabase API directly. Always verify a
  permission exists in `schema.sql` before assuming the UI enforces it.

## 3. Role model — how the hierarchy actually works

Three concepts, don't conflate them:

1. **`profiles.global_role`** — one of `admin`, `event_manager`, `user`. This is a
   site-wide rank. It only ever changes through the `change_user_role()` RPC (never a
   direct `UPDATE`), which enforces:
   - only admins call it
   - admins may demote themselves but never another admin
   - an `event_manager` can't be demoted if they're the last one in the system
2. **`event_managers` (event_id, user_id)** — which specific event(s) a person actively
   manages. Set automatically when their event is approved (`approve_event()`), and can
   be extended by an existing manager or admin via `add_event_manager()`.
3. **`team_members.role`** (`manager` | `player`) — scoped to one team. Creating a team
   makes you its manager automatically. Team managers add/remove players on their own
   team; event managers can do this on any team inside their event (tier inheritance);
   admins can do it anywhere.

**Design call made for you:** "player" is not a global role — it's derived from
`team_members` (anyone with a `player` row on any team). This is what unlocks their
public player-profile page. If you want players to have a genuinely distinct global
permission later, add a `player` value to the `app_role` enum and go from there — but
per your spec, player and user only need to differ in what page exists for them, not in
what they're allowed to *do*, so this keeps the model simpler.

### Permission matrix

| Action | Admin | Event manager | Team manager (own team) | Player | User |
|---|:---:|:---:|:---:|:---:|:---:|
| View approved events, brackets, budgets, leaderboards | ✅ | ✅ | ✅ | ✅ | ✅ |
| Propose (launch) an event | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve / reject a pending event | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit an event's own details | ✅ | ✅ (own event) | ❌ | ❌ | ❌ |
| Promote a user to `event_manager` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Promote a user to `admin` | ✅ | ❌ | ❌ | ❌ | ❌ |
| Demote an `event_manager` | ✅ (if >1 exists) | ❌ | ❌ | ❌ | ❌ |
| Demote an `admin` | Self only | ❌ | ❌ | ❌ | ❌ |
| Create a team under an event | ✅ | ✅ | ✅ | ✅ | ✅ |
| Add/remove players on a team | ✅ (any) | ✅ (within own event) | ✅ (own team) | ❌ | ❌ |
| Enter match scores / stats | ✅ | ✅ (own event) | ❌ | ❌ | ❌ |
| Add a budget entry | ✅ | ✅ (own event) | ❌ | ❌ | ❌ |
| View the activity/audit log | ✅ | ✅ (own event) | ❌ | ❌ | ❌ |
| Edit or delete anything in the audit log | Nobody. Ever. | | | | |

Every row above is enforced in `schema.sql`, not just described here.

## 4. Database schema

Canonical version: `supabase/schema.sql`. Run it once in the Supabase SQL Editor on a
fresh project. Summary of tables:

- `profiles` — one per user, auto-created on first Google sign-in
- `events`, `event_managers`
- `teams`, `team_members`
- `matches` (bracket structure via `next_match_id`), `player_stats`
- `budget_entries` — append-only ledger (see note below)
- `audit_log` — append-only, trigger-enforced, unreadable by anyone below event-manager tier

**Why `budget_entries` has no UPDATE/DELETE policy:** this is deliberate, not a gap.
A transparent budget shouldn't allow silently editing a past entry. If a cost was
recorded wrong, the fix is a new offsetting entry ("Correction: refund from vendor X"),
so the full history stays visible. Mention this explicitly in your defense/demo — it's
one of the strongest points of the whole project.

**Why `audit_log` is separate from RLS alone:** RLS can stop clients from issuing
`UPDATE`/`DELETE`, but a `BEFORE UPDATE OR DELETE` trigger that raises an exception
stops it at the table level regardless of *who* is asking, including a future bug in
your own app code. Belt and suspenders.

## 5. Authentication setup

1. Create a Supabase project.
2. In Google Cloud Console, create an OAuth 2.0 Client ID (Web application). Add
   Supabase's callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an
   authorized redirect URI.
3. In Supabase → Authentication → Providers → Google, paste the client ID and secret.
4. In your Next.js app, install `@supabase/supabase-js` and `@supabase/ssr`. Use
   `@supabase/ssr` for cookie-based sessions so Server Components can read the logged-in
   user without a client-side round trip.
5. `profiles` rows are created automatically by the `handle_new_user()` trigger — you
   never write signup logic yourself.
6. **Bootstrap problem:** the very first admin can't be created through the app (nothing
   can call `change_user_role` yet). Sign in once, then run the one-line `UPDATE`
   at the bottom of `schema.sql` directly in the Supabase SQL Editor.

## 6. Frontend structure

```
/app
  page.tsx                              → Home
  login/page.tsx                        → Google sign-in
  auth/callback/route.ts                → Supabase OAuth callback handler
  events/
    page.tsx                            → Events list (public + pending-for-owner)
    new/page.tsx                        → Propose an event
    [eventId]/
      page.tsx                          → Event overview (approve/reject if admin+pending)
      teams/page.tsx                    → Teams grid
      teams/new/page.tsx                → Create a team
      teams/[teamId]/page.tsx           → Team dashboard
      bracket/page.tsx                  → Bracket view
      budget/page.tsx                   → Budget ledger
      activity/page.tsx                 → Audit log (managers/admin only)
      leaderboard/page.tsx              → Top performers for this event
  players/[playerId]/page.tsx           → Public player profile
  admin/
    page.tsx                            → Pending approvals
    roles/page.tsx                      → Role management table
  dashboard/page.tsx                    → "My stuff": events/teams I'm involved in
/components
  events/  teams/  budget/  bracket/  ui/
/lib
  supabase/client.ts                    → browser client
  supabase/server.ts                    → server client (reads cookies via @supabase/ssr)
  permissions.ts                        → small TS helpers mirroring the SQL role checks,
                                           used only to decide what UI to show — never
                                           trust these for actual security
  types/database.types.ts               → generated via `supabase gen types typescript`
middleware.ts                            → refreshes the Supabase session cookie
```

### Page-by-page detail

**Home (`/`)** — Public. Hero section, a strip of currently approved/ongoing events,
a small "top performers this week" teaser, and a "Propose an event" call to action for
logged-in users.

**Events list (`/events`)** — Public sees approved events only (RLS handles the
filtering automatically — your query doesn't need a manual `status = 'approved'` filter
for anonymous users, though you can add one for clarity). Logged-in users also see their
own pending/rejected proposals in a separate section.

**Propose event (`/events/new`)** — Any logged-in user. Simple form: name, sport,
description, start/end date, optional cover image upload. Submits with
`status = 'pending'`. Show a clear "waiting for admin approval" state afterward.

**Event overview (`/events/[eventId]`)** — Tabs for Teams / Bracket / Budget / Activity
/ Leaderboard. If the viewer is an admin and the event is pending, show Approve/Reject
buttons that call the `approve_event` RPC (or a simple status update for rejection).

**Teams (`/events/[eventId]/teams`)** — Grid of team cards (logo, name, player count).
"Create team" button for any logged-in user.

**Create team (`/events/[eventId]/teams/new`)** — Creates the `teams` row, then
immediately inserts a `team_members` row for the creator with `role = 'manager'`. Do
both in one Server Action so it can't fail halfway.

**Team dashboard (`/events/[eventId]/teams/[teamId]`)** — Roster table (name, jersey
number, position), that team's match results, and — for the team's manager, that
event's manager, or an admin — an "add player" search-and-add control and a remove
button per row.

**Bracket (`/events/[eventId]/bracket`)** — Visual bracket tree built from `matches`,
grouped by `round`. Click a match to see the box score (pulls from `player_stats`).
Event managers/admin get inline score-editing; everyone else sees it read-only.

**Budget (`/events/[eventId]/budget`)** — Table of entries with running totals
(income, expenses, net), a small bar or donut chart, and receipt thumbnails linking to
the uploaded proof. "Add entry" form for event managers/admin only — no edit/delete UI
at all, matching the append-only design.

**Activity (`/events/[eventId]/activity`)** — Reverse-chronological, paginated feed:
"Maya added a $40 expense — Jerseys — 2 hours ago." Visible only to that event's
managers and admins (RLS enforces this; the page should also 404/redirect otherwise).

**Leaderboard (`/events/[eventId]/leaderboard`)** — Aggregate `player_stats` grouped by
player, sortable by points/goals/assists. Consider also a global `/leaderboard` across
all events for the home page teaser.

**Player profile (`/players/[playerId]`)** — Public. Avatar, name, every team/event
they've played in, and their aggregate stats. This is the main thing a "player" gets
that a plain "user" doesn't.

**Admin (`/admin`)** — Pending-event queue with approve/reject actions, and a role
management table (search a user, change their role via a dropdown that calls
`change_user_role`). Surface the RPC's error messages directly — they're already
written as clear, specific rejection reasons ("Cannot remove the last remaining event
manager").

**Dashboard (`/dashboard`)** — Logged-in landing page: events you manage, teams you're
on, quick links. Not required for v1 but makes the app feel finished.

## 7. Connecting frontend to backend, concretely

- **Reads in Server Components:** create a server-side Supabase client
  (`@supabase/ssr`'s `createServerClient`, wired to `next/headers` cookies), then just
  `await supabase.from('events').select('*')`. RLS automatically returns only what this
  user is allowed to see — no manual filtering needed for security, only for UX.
- **Interactive writes in Client Components:** a browser Supabase client for things
  like "add player to roster" — again, RLS is the actual gate.
- **Privileged actions:** wrap `supabase.rpc('approve_event', { target_event })` etc. in
  a Next.js Server Action. You're calling the RPC as the logged-in user (not the service
  role key) — the function's own internal `if caller_role <> 'admin'` check is what
  protects it. You should essentially never need the Supabase **service role key** in
  this app; keep it out of the codebase entirely unless you hit a case that truly
  requires bypassing RLS (there isn't one in this spec).
- **File uploads:** upload directly from the browser to Supabase Storage using the
  client SDK; add a matching `storage.objects` RLS policy (see appendix) so only event
  managers can upload into a given event's folder.

## 8. File storage

Buckets:
- `event-covers` (public read)
- `team-logos` (public read)
- `budget-proofs` (public read — the budget is already public, so are its receipts)

Example Storage RLS policy, assuming files are stored as `{event_id}/{filename}`:

```sql
create policy "budget_proofs_public_read"
on storage.objects for select
using (bucket_id = 'budget-proofs');

create policy "budget_proofs_managers_upload"
on storage.objects for insert
with check (
  bucket_id = 'budget-proofs'
  and public.is_event_manager_of(auth.uid(), (storage.foldername(name))[1]::uuid)
);
```

## 9. Phased build order

Do these in order. Each phase should end with something you can click through, not just
code that compiles. Copy the relevant section of this doc into Copilot Chat at the start
of each phase.

**Phase 0 — Project setup**
Create the Supabase project, run `schema.sql`, scaffold Next.js + TypeScript + Tailwind,
install `@supabase/supabase-js` and `@supabase/ssr`, generate TypeScript types with the
Supabase CLI.

**Phase 1 — Auth**
Wire up Google sign-in end to end. Confirm a `profiles` row appears automatically after
your first login. Manually promote yourself to `admin` via the SQL Editor.

**Phase 2 — Events**
Build the events list, event proposal form, event overview page, and the admin
approve/reject flow. Confirm `approve_event` correctly creates the `event_managers` row
and bumps the creator's role.

**Phase 3 — Teams and rosters**
Team creation, team listing, team dashboard with add/remove player. Confirm permission
boundaries: a random logged-in user should not be able to edit a team they don't manage
(test this by trying the Supabase query directly, not just by checking the UI hides the
button).

**Phase 4 — Bracket and matches**
Build the bracket structure and score entry. Start with single-elimination only; double
elimination or round-robin can come later.

**Phase 5 — Budget**
Budget entry form, ledger table with running totals, receipt upload.

**Phase 6 — Activity log and leaderboard**
Activity feed page, leaderboard aggregation. This is a good point to double check the
audit trigger is actually firing on every table by watching `audit_log` grow as you use
the app.

**Phase 7 — Admin panel and polish**
Role management UI, player profile pages, home page, dashboard, empty states, loading
states, mobile responsiveness.

**Phase 8 — Deploy**
Push to Vercel, set environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), confirm the Google OAuth redirect URI includes your
production domain, do a full walkthrough as a fresh Google account to catch anything
the admin-eye-view missed.

## 10. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

That's genuinely all you need client-side. No service role key should appear in this
project's environment variables at all, per §7.
