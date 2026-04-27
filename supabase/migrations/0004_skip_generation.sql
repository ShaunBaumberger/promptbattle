-- =============================================================
-- Test-mode toggle: skip image generation for 2-player tournaments.
-- When true, generateMatchImagesAction transitions the match to `reveal`
-- without calling the Gemini API (so you can test the typing/voting flow
-- without burning $$ on every test run).
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournaments
  add column skip_image_generation boolean not null default false;
