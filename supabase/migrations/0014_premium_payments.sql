-- =============================================================
-- Stripe pay-per-event. A tournament is upgraded free → premium by a
-- one-time Stripe Checkout payment. We store the Checkout Session id
-- for idempotent fulfillment + reconciliation with the Stripe
-- dashboard (which remains the payment ledger — no local ledger).
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournaments
  add column premium_session_id text,
  add column premium_paid_at timestamptz;
