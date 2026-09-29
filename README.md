# CSEDU_Sports_Hub

CSE DU department sports management platform built with Next.js 16, React 19, Supabase & Tailwind CSS 4. Propose and approve events, manage teams, rosters and budget transparency, run live knockout brackets with real-time updates, and track leaderboards, awards, and champions — with Google sign-in, unique usernames, and per-event role management.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Database & Auth**: Supabase (PostgreSQL, Row Level Security, RPCs, Realtime WebSockets)
- **Styling**: Tailwind CSS 4 (Custom Scoreboard Graphite Theme)
- **Type Safety**: TypeScript 5

## Getting Started

First, install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Database & Supabase

- **Full Reference Schema**: `supabase/schema.sql` (single authoritative schema file with all tables, RLS policies, security definer RPCs, audit triggers, and performance indexes).
- **Migrations**: `supabase/migrations/` (versioned incremental migrations for `npx supabase db push`).
- **Feature Reference SQL**: `supabase/reference/` (isolated SQL snippets for individual modules).
- **ER Diagrams**: `docs/diagrams/` (schema visualizations in PNG, SVG, PDF, and Graphviz DOT formats).

