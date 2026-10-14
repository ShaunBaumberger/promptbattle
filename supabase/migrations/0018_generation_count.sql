-- =============================================================
-- Count image/video generations per match. "Restart match" sends a
-- match back through generation; on tournaments that run on the
-- platform's own AI key this allows one regeneration per match (a
-- genuine retry) and counts its cost against the global budget, so
-- restarts can't be used to generate unlimited images for free.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table matches
  add column if not exists generation_count int not null default 0;
