-- =============================================================
-- Separate "test mode" tournaments from real ones. Until now we used
-- player_count=2 as a proxy for "this is a test", which conflated two
-- ideas — a real 2-player face-off and a debug session. This adds an
-- explicit flag so 2-player real tournaments behave like every other
-- bracket size, and a dedicated Test-Modus exposes the debug controls
-- (replay, skip Gemini, etc.).
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournaments
  add column is_test_mode boolean not null default false;

-- Backfill: any 2-player tournament that already had skip_image_generation
-- on was almost certainly a debug run, so promote it to is_test_mode.
update tournaments
set is_test_mode = true
where player_count = 2 and skip_image_generation = true;
