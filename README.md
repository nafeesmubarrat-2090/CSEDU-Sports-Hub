# CSE DU Sports Event Management System (CSEDU Sports Hub)

#### Video Demo: [https://youtu.be/YOUR_DEMO_VIDEO_ID](https://youtu.be/YOUR_DEMO_VIDEO_ID)

---

## The Backstory & Motivation

As students of the Department of Computer Science and Engineering, University of Dhaka, our batch had the privilege and responsibility of organizing our department's annual intra-department football tournament. What should have been a purely joyful and competitive celebration of department sports quickly exposed acute logistical challenges that student organizers face year after year:

1. **Coordination Chaos**: Tournament announcements, team registrations, player verifications, and match fixtures were scattered across disparate Messenger and WhatsApp group chats. Important notices were buried, player eligibility was difficult to verify, and communication was disjointed.
2. **Budget & Financial Opacity**: Collecting funds from participating teams, sponsors, and department allocations while tracking expenditures on ground rentals, match balls, referee fees, refreshments, and trophies on paper receipts created inevitable friction. Even with genuine honesty from organizers, the lack of an open, verifiable public ledger caused confusion and occasional skepticism among participants regarding where every taka went.
3. **Disputed & Disappearing Records**: Tournament brackets were drawn on paper or static image files that had to be manually edited and re-uploaded after every match. Once the final whistle blew and trophies were handed out, the records, scores, top-scorer leaderboards, and memories effectively vanished into past chat histories.

Witnessing these recurring pain points firsthand inspired us to build the **CSE DU Sports Event Management System (CSEDU Sports Hub)**. 

Our vision was simple: build a robust, transparent, and enduring digital headquarters for all sports tournaments within our department. We wanted to eliminate operational chaos for our own tournaments and, more importantly, ensure that our **juniors and future batches** will never have to repeat the same struggles. The platform is intentionally architected to be sport-agnostic—equally capable of running football, cricket, basketball, volleyball, badminton, or table tennis tournaments—ensuring a lasting institutional asset for the CSE DU community for years to come.

---

## Description & System Overview

The **CSEDU Sports Hub** is a modern full-stack web application designed to bring complete operational transparency, automated scheduling, and real-time engagement to departmental sports. Every tournament moves through a formal proposal and approval lifecycle. Team managers register rosters with validated student profiles and jersey numbers. Knockout tournament brackets automatically advance and broadcast updates to spectators in real time via WebSockets. Financial integrity is preserved through an append-only, tamper-proof budget ledger, backed by an immutable audit log that even administrators cannot erase.

The application is built with **Next.js 16** (App Router) leveraging **React 19**, **TypeScript 5**, **Tailwind CSS 4** (with a custom *Scoreboard Graphite* design language), and **Supabase** (PostgreSQL, Row Level Security, RPC stored procedures, Google OAuth, and Realtime WebSocket subscriptions). Rather than relying on a separate backend server where authorization logic can easily drift from database reality, CSEDU Sports Hub enforces security and business invariants directly inside PostgreSQL using Row Level Security (RLS) policies and `SECURITY DEFINER` functions.

---

## Core Features

- **Event Proposal & Approval Workflow**: Any registered student or faculty member can propose a sports tournament. Department administrators review, approve, or reject proposed events. Upon approval, the proposer is automatically granted event manager privileges.
- **Role Hierarchy & Tier Inheritance**: A multi-tiered access control model with `admin`, `event_manager`, and `user` global roles. Event managers manage their specific events, team managers manage team rosters, and admins possess department-wide oversight. Role promotions and demotions are governed by atomic PostgreSQL RPC functions that prevent accidental demotions of the final remaining administrator.
- **Roster & Team Management**: Team managers can register teams for approved events, search department users by email or username, and manage active player rosters with assigned jersey numbers and positions.
- **Live Interactive Tournament Brackets**: Single-elimination tournament trees automatically generated for competing teams. Event managers report match scores and advance winners with auto-promotion for byes, while players and spectators view bracket movements in real time via Supabase Realtime WebSockets.
- **Transparent Budget Ledger**: An append-only financial ledger tracking income and expense entries for each event with categorization (equipment, venue, prizes, refreshments). Corrections are recorded as compensating entries, ensuring complete financial transparency for the department. Includes one-click CSV export functionality.
- **Leaderboards, Awards & History**: Track points tables, award individual accolades (MVP, Best Scorer, Fair Play), celebrate tournament champions, and preserve a permanent historical record of past department tournaments.
- **Immutable Activity Audit Log**: Every critical event—proposals, approvals, roster modifications, score reports, and budget entries—triggers an append-only audit log entry with timestamp and actor details, creating accountability across the department.
- **Department Profile System**: Google OAuth integration automatically provisions student and faculty profiles, complete with customizable handles, display names, and individual participation statistics.

---

## Key Challenges Faced During Development

Building this platform presented several technical challenges that required careful architectural decisions:

1. **Moving the Security Boundary to PostgreSQL (RLS)**:
   Instead of writing repetitive authorization checks in server controllers, we committed to enforcing all rules in PostgreSQL. Writing granular Row Level Security (RLS) policies that reflect our multi-tier role hierarchy (Admin > Event Manager > Team Manager > Player/User) while avoiding circular subqueries required designing dedicated database helper functions (`is_admin`, `is_event_manager_of`, `is_team_manager_of`).
2. **Immutable Financial Ledger Design**:
   Guaranteeing financial transparency meant preventing anyone—including organizers and database admins—from surreptitiously editing or deleting past transactions. We designed `budget_entries` as an append-only ledger without `UPDATE` or `DELETE` policies. If an organizer makes a bookkeeping mistake, they must record an explicit compensating entry with an explanation, mirroring real-world accounting standards.
3. **Live Bracket Synchronization via WebSockets**:
   During tournaments, match outcomes must reach all spectating students immediately without requiring constant page refreshes. Implementing `RealtimeBracketListener` with Supabase Realtime channels to detect PostgreSQL `matches` table updates and trigger instantaneous Next.js router cache revalidations required careful event lifecycle management to prevent connection leaks.
4. **Relational Query Disambiguation (PostgREST Foreign Keys)**:
   In our data model, the `team_members` table has two separate foreign keys pointing to `profiles` (`user_id` for the athlete, and `added_by` for the manager who added them). Supabase's PostgREST engine threw ambiguous relationship errors (`PGRST201`) when querying team rosters. We resolved this by explicitly targeting the intended foreign key constraint name (`profiles!team_members_user_id_fkey`) to ensure flawless data embedding.

---

## Acknowledgment of AI & Tool Assistance

In the spirit of transparency and academic honesty, I acknowledge the use of **GitHub Copilot** as an AI pair-programming assistant during the development of this project. Specifically, GitHub Copilot was utilized for the following tasks:

- **PostgreSQL RLS Policies & Stored Procedures**: Assisting in drafting complex SQL queries, recursive bracket node traversals (`generate_single_elimination_bracket`), and audit trigger functions (`log_activity_with_event_id`).
- **TypeScript Type Scaffolding**: Accelerating the creation of TypeScript interfaces and server action parameter typings corresponding to Supabase table structures.
- **Tailwind CSS 4 UI Styling**: Generating responsive CSS utilities for custom scoreboard cards, tournament tree bracket layouts, and budget summary tables adhering to our Scoreboard Graphite theme.
- **Query Debugging**: Troubleshooting PostgREST relational embedding syntax when handling multiple foreign keys between tables.

All code and architectural patterns suggested by Copilot were rigorously reviewed, tested, modified, and validated by me to ensure correctness, security, and full alignment with project requirements.

---

## Project Structure & File Explanation

Below is an overview of the key files and directories in this repository:

### Root Files
- **`package.json`**: Defines project dependencies (`next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`, `tailwindcss`), dev dependencies, and execution scripts (`npm run dev`, `npm run build`, `npm run start`, `npm run lint`).
- **`tsconfig.json`**: TypeScript configuration establishing compiler options, strict mode, JSX transformation, and the `@/*` root path alias.
- **`next.config.ts`**: Next.js project configuration.
- **`postcss.config.mjs`**: PostCSS configuration integrating the Tailwind CSS v4 pipeline.
- **`proxy.ts`**: Next.js request proxy / middleware convention ensuring Supabase authentication session cookies are continuously refreshed and synchronized across all incoming requests.
- **`eslint.config.mjs`**: ESLint configuration extending `eslint-config-next`.
- **`.env.example`**: Template specifying necessary environment variables (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`) for local development.
- **`.gitignore`**: Specifies files and directories untracked by Git (build output `.next/`, `node_modules/`, secret `.env` files, IDE caches, and build artifacts).

### `app/` Directory (Next.js App Router)
- **`app/layout.tsx`**: Root HTML layout embedding typography (Barlow Condensed, Inter, JetBrains Mono), theme variables, and the global navigation bar.
- **`app/globals.css`**: Design system tokens, Tailwind CSS 4 `@theme` directives, Scoreboard Graphite color palette, custom card styles, and utility classes.
- **`app/page.tsx`**: Public landing page introducing the CSE DU Sports Hub with quick navigation to live events, leaderboards, and features.
- **`app/login/page.tsx`**: Dedicated authentication page supporting Google OAuth login.
- **`app/auth/callback/route.ts`**: Server Route Handler exchanging OAuth authorization codes for Supabase user sessions and redirecting users back to their intended route.
- **`app/dashboard/`**:
  - `page.tsx`: Authenticated user dashboard displaying events managed by the user and teams they participate in.
  - `loading.tsx`: Skeleton loading placeholder for smooth route transitions.
- **`app/profile/page.tsx`**: User profile page showing user details, global role badge, username, and tournament participation.
- **`app/admin/page.tsx`**: Administrative control center allowing site admins to review pending event proposals, approve/reject events, and manage global user roles.
- **`app/events/`**:
  - `page.tsx`: Main events directory listing all approved upcoming and past tournaments with status filters.
  - `new/page.tsx`: Event proposal submission form for proposing new department tournaments.
  - `loading.tsx`: Loading state for the event directory.
- **`app/events/[eventId]/`**:
  - `page.tsx`: Comprehensive event overview displaying dates, sports category, managers, quick actions, and status badges.
  - `loading.tsx`: Loading placeholder for event detail views.
  - `teams/page.tsx`: Public list of teams registered under a specific tournament.
  - `teams/new/page.tsx`: Form for authenticated users to register and manage a new team for the event.
  - `teams/[teamId]/page.tsx`: Team dashboard displaying manager details, player rosters, and roster management tools (add/remove player by email or handle).
  - `bracket/page.tsx`: Tournament knockout bracket board visualizing match fixtures, rounds, and live progression.
  - `bracket/loading.tsx`: Loading state for tournament bracket rendering.
  - `budget/page.tsx`: Append-only event budget ledger with income, expenses, category breakdown, balance summary, and CSV export.
  - `budget/loading.tsx`: Loading state for budget ledger views.
  - `leaderboard/page.tsx`: Tournament standings, individual awards, and crowned champions.
  - `activity/page.tsx`: Immutable activity and audit log detailing all administrative and operational actions taken within the event.

### `components/` Directory
- **`components/Navbar.tsx`**: Responsive global navigation bar with links, branding, authentication state detection, and role-based links (such as the Admin link for administrators).
- **`components/GoogleSignInButton.tsx`**: Interactive client button initiating Supabase Google OAuth sign-in flow.
- **`components/NavbarSignOut.tsx`**: Client component triggering graceful sign-out and session clearance.
- **`components/RealtimeBracketListener.tsx`**: Client WebSocket listener subscribing to Supabase Realtime channel updates on the `matches` table and re-validating bracket views instantly when match scores change.
- **`components/ConfirmButton.tsx`**: Accessible confirmation button prompting users before executing destructive or irreversible actions.
- **`components/ExportBudgetButton.tsx`**: Client utility button exporting the current event's budget ledger entries to formatted CSV files.

### `lib/` Directory
- **`lib/supabase/client.ts`**: Browser-side Supabase client utility (`createBrowserClient`) for client-side interactions and real-time subscriptions.
- **`lib/supabase/server.ts`**: Server-side Supabase client utility (`createServerClient`) utilizing Next.js `cookies()` for secure server components and server actions.
- **`lib/supabase/auth.ts`**: Authentication helper retrieving the current user session and checking administrative privileges.
- **`lib/types/database.types.ts`**: Fully typed database definitions matching the Supabase PostgreSQL schema.

### `supabase/` Directory
- **`supabase/schema.sql`**: The single authoritative PostgreSQL database schema file containing all table definitions, triggers, constraints, Row Level Security policies, and stored procedures (`change_user_role`, `approve_event`, `reject_event`, `generate_single_elimination_bracket`, `report_match_score`, etc.).
- **`supabase/migrations/`**: Versioned SQL migrations tracking schema evolutions (grants, team creation RPCs, budget deletion policies, and query performance indexes).
- **`supabase/config.toml`**: Local Supabase CLI configuration file.

### `docs/` Directory
- **`docs/PROJECT_SPEC.md`**: Architectural specification and design blueprint detailing role hierarchies, data flow, security model, and API contracts.
- **`docs/diagrams/`**: Visual database Entity Relationship (ER) diagrams provided in vector and raster formats (`er_diagram.png`, `er_diagram.svg`, `er_diagram.pdf`, and `er_diagram.dot` Graphviz source).

---

## Design Decisions

### 1. Database-Enforced Security (PostgreSQL RLS over Application-Layer Checks)
In many traditional web applications, authorization is handled entirely in web route controllers or middleware. If an attacker discovers an unprotected endpoint or directly queries the API, permissions can easily be bypassed. In CSEDU Sports Hub, the database itself acts as the authoritative security boundary:
- **Row Level Security (RLS)** is enabled on every single table.
- Unapproved events cannot be read by general users—even if queried directly through the client library.
- Financial records and audit logs have strict constraints: records cannot be arbitrarily altered or wiped without trace.

### 2. Next.js 16 App Router & Server Components
Next.js App Router was chosen because the majority of views (event overviews, budgets, team lists, activity logs) are data-rich and benefit greatly from Server-Side Rendering (SSR):
- Initial page loads deliver complete HTML with zero client-side fetching waterfall.
- Data fetching occurs directly in Server Components using server-scoped Supabase clients, eliminating the boilerplate of separate REST API route controllers.
- Interactive controls (such as the Realtime WebSocket listener or CSV export) are isolated into lightweight Client Components.

### 3. Append-Only Ledgers & Immutability
A core requirement for department sports transparency is accountability. Rather than allowing users or admins to edit past budget entries or delete audit rows:
- `budget_entries` operates as an append-only ledger where corrections are documented as explicit new rows with explanations.
- `audit_log` has no `UPDATE` or `DELETE` policy enabled for any user role, ensuring an indelible history of tournament events.

### 4. Supabase Realtime for Brackets
During tournament days, matches conclude rapidly. Rather than requiring users to manually refresh their browsers, `RealtimeBracketListener` establishes a WebSocket connection to listen for `UPDATE` events on the `matches` table. When an event manager submits a match score, all spectator screens automatically update.

---

## How to Run Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18.x or 20.x recommended)
- [npm](https://www.npmjs.com/) (version 9.x or higher)
- A [Supabase](https://supabase.com/) account (or a local Supabase CLI instance)

### Step 1: Clone the Repository
```bash
git clone https://github.com/nafeesmubarrat-2090/CSEDU-Sports-Hub.git
cd CSEDU-Sports-Hub
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure the Database
1. Create a new project in your Supabase dashboard.
2. In the Supabase SQL Editor, open and run the entire contents of [`supabase/schema.sql`](supabase/schema.sql). This will create all tables, enums, triggers, RLS policies, and RPC functions.
3. In Supabase Dashboard under **Authentication > Providers**, enable **Google** (or configure test authentication).

### Step 4: Configure Environment Variables
Copy the template `.env.example` into `.env.local`:
```bash
cp .env.example .env.local
```
Open `.env.local` and fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### Step 5: Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

---

## Verification & Testing
To verify TypeScript correctness and linting:
```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint
```
