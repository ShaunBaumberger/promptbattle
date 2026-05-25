-- =============================================================
-- NOTE: This is one of TWO 0008 migrations. The other is
-- `0008b_preparing_status.sql`. Both must be applied; order
-- between them does not matter (they touch disjoint columns
-- and constraints). Apply 0008 → 0008b → 0009 → … in sequence.
-- =============================================================
-- Final-round video reveal:
--   * matches.video_a_url / video_b_url store Veo-generated mp4 URLs
--     (Supabase Storage public URLs). Populated only for FINAL matches.
--     result_a_url / result_b_url still hold the Nano Banana image
--     backup so the reveal/bracket/champion fallbacks always have
--     something to show.
--   * tournaments.current_video_playing = 'A' | 'B' | null is a
--     transient admin-controlled signal that tells the stage which
--     final-round video to play fullscreen. Cleared when the admin
--     returns to the reveal layout.
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table matches
  add column video_a_url text,
  add column video_b_url text;

alter table tournaments
  add column current_video_playing text
    check (current_video_playing in ('A', 'B'));
