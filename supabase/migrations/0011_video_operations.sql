-- =============================================================
-- Polling architecture for Veo video generation.
--
-- Veo render takes 30-120s, which doesn't reliably fit in a single
-- Vercel function (Hobby caps at 60s). Instead of waiting inline,
-- the kick-off action stores Veo's long-running-operation name and
-- returns immediately. A separate poll action — called every ~10s by
-- the stage / admin client — checks Veo's status, downloads + uploads
-- the asset when done, and writes the public URL onto the match row.
--
-- Each call is short (1-5s), so Vercel's function limit doesn't bite
-- regardless of how long Veo takes.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table matches
  add column video_a_operation text,
  add column video_b_operation text;
