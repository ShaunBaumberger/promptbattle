-- =============================================================
-- Multi-provider AI support. A BYO tournament can now hold one key per
-- provider (google / openai / replicate), each AES-256-GCM encrypted by
-- the app before it is stored. Same RLS-locked table as before (0012):
-- only the service-role key can read it.
--
-- Model choices live in the existing tournaments.image_model /
-- video_model columns as refs like 'openai:sora-2' (no schema change).
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournament_secrets
  add column byo_keys jsonb not null default '{}'::jsonb;

-- Carry over any single Gemini key stored by the earlier BYO build.
update tournament_secrets
set byo_keys = jsonb_build_object('google', byo_gemini_key_encrypted)
where byo_gemini_key_encrypted is not null;
