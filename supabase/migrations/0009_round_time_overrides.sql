-- =============================================================
-- Per-round timer overrides. Admins can dial up the time available
-- in later rounds (e.g. 60s for R16, 90s for SF, 120s for FINAL)
-- without affecting the tournament-wide default. Stored as a JSON
-- map of round → seconds; missing entries fall back to
-- tournaments.round_time_seconds.
--
-- Example: {"R16": 60, "SF": 90, "FINAL": 120}
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournaments
  add column round_time_overrides jsonb not null default '{}'::jsonb;
