-- =============================================================
-- NOTE: This is the second of two 0008 migrations. The other is
-- `0008_final_videos.sql`. Both must be applied; order between
-- them does not matter (they touch disjoint columns and
-- constraints). Filename uses the `0008b` suffix so the pair
-- can't be silently collapsed by tooling that keys on numeric
-- prefixes alone.
-- =============================================================
-- Add a `preparing` match status so the admin can stage a match
-- (positioning players on the chairs left/right, stage view shows
-- their names but task is hidden) before clicking "Match starten",
-- which transitions preparing → live and reveals the task on
-- /stage and on the players' phones simultaneously.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table matches drop constraint matches_status_check;
alter table matches
  add constraint matches_status_check
  check (status in (
    'pending', 'preparing', 'live', 'locked',
    'generating', 'reveal', 'voting', 'done'
  ));
