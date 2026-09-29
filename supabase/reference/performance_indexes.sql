-- =========================================================================
-- Performance Indexes for CSE DU Sports Hub
-- =========================================================================
-- Eliminates sequential table scans across all foreign keys, filters,
-- and ordered queries for events, matches, rosters, budget, and audit log.
-- =========================================================================

-- Events
CREATE INDEX IF NOT EXISTS idx_events_status_start_date ON public.events (status, start_date);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events (created_by);
CREATE INDEX IF NOT EXISTS idx_events_lifecycle ON public.events (lifecycle);

-- Event Managers
CREATE INDEX IF NOT EXISTS idx_event_managers_user_id ON public.event_managers (user_id);
CREATE INDEX IF NOT EXISTS idx_event_managers_event_id ON public.event_managers (event_id);

-- Teams & Team Members
CREATE INDEX IF NOT EXISTS idx_teams_event_id ON public.teams (event_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON public.team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON public.team_members (user_id);

-- Matches (Brackets and Scoreboards)
CREATE INDEX IF NOT EXISTS idx_matches_event_round_match ON public.matches (event_id, round, match_number);
CREATE INDEX IF NOT EXISTS idx_matches_winner_id ON public.matches (winner_id);
CREATE INDEX IF NOT EXISTS idx_matches_next_match_id ON public.matches (next_match_id);

-- Budget, Player Stats, Awards & Audit Trail
CREATE INDEX IF NOT EXISTS idx_budget_entries_event_id ON public.budget_entries (event_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_match_id ON public.player_stats (match_id);
CREATE INDEX IF NOT EXISTS idx_event_awards_event_id ON public.event_awards (event_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_created ON public.audit_log (event_id, created_at DESC);
