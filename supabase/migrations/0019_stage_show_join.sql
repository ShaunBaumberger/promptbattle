-- =============================================================
-- Host-controlled join overlay on the stage. Mid-tournament the host can
-- put a big QR code + join code back on the projector, so players who
-- lost their connection (or arrive late) can scan straight back in.
-- The stage picks the flag up through the existing tournaments realtime
-- subscription.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournaments
  add column if not exists stage_show_join boolean not null default false;
