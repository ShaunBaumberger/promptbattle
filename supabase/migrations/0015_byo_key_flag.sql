-- =============================================================
-- BYO-key: denormalized flag on tournaments. The encrypted key itself
-- lives in tournament_secrets (0012, RLS-locked, service-role only);
-- this boolean lets every tier gate and the UI know "this tournament
-- runs on its own key" without touching the secrets table. A BYO
-- tournament gets premium features and bypasses the free-tier quota +
-- platform budget (generation is billed to the key owner's Google
-- account, zero platform cost).
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournaments
  add column byo_key boolean not null default false;
