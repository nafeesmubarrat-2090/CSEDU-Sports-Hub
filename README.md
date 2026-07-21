# CSEDU_Sports_Hub

CSE DU department sports management platform built with Next.js 16, React 19, Supabase & Tailwind CSS 4. Propose and approve events, manage teams, rosters and budget transparency, run knockout brackets, and track leaderboards, awards, and champions — with Google sign-in, unique usernames, and per-event role management.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database setup

SQL migrations live in `supabase/`. Run `schema.sql` first, then apply the feature migrations (`bracket.sql`, `awards.sql`, `event_lifecycle.sql`, `role_management.sql`, `username.sql`) in your Supabase project.
