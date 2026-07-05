-- =============================================================
-- Phase 2: hosted, multi-tenant mode.
--
-- Every tournament now belongs to a Supabase Auth user (the host who
-- created it). Admin login moves from the single shared HOST_PASSWORD to
-- Supabase Auth (OAuth / magic-link / email+password).
--
-- FRESH START: existing tournaments are wiped (product decision) so we can
-- add a NOT NULL owner without backfilling legacy single-host rows.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

-- 1. Wipe legacy single-host data. FKs from matches/participants/tasks/votes
--    cascade off tournaments. (Storage image files are not removed here.)
truncate table tournaments cascade;

-- 2. Ownership — every tournament belongs to an auth user.
alter table tournaments
  add column owner_id uuid references auth.users(id) on delete cascade;
alter table tournaments alter column owner_id set not null;
create index tournaments_owner_idx on tournaments(owner_id);

-- 3. Tier / plan. 'free' = platform-funded + feature-gated; 'premium' = paid
--    (reserved for the future Stripe build). BYO-key unlocks premium features
--    regardless of plan (see tournament_secrets).
alter table tournaments
  add column plan text not null default 'free'
    check (plan in ('free', 'premium'));

-- 4. Optional per-tournament model overrides (non-secret). NULL = tier default.
alter table tournaments
  add column image_model text,
  add column video_model text;

-- 5. Usage tracking. `started_at` is set when a tournament goes live (i.e. when
--    it begins consuming generation). Used for the "5 free games / 30 days"
--    per-account cap.
alter table tournaments
  add column started_at timestamptz;

-- 6. BYO Gemini key lives in a SEPARATE table with NO public read policy, so
--    the (encrypted) secret is never exposed through the publicly-readable
--    tournaments table that the stage/play views rely on. App encrypts the
--    value before storing (see lib/crypto.ts).
create table if not exists tournament_secrets (
  tournament_id uuid primary key references tournaments(id) on delete cascade,
  byo_gemini_key_encrypted text,
  updated_at timestamptz not null default now()
);
alter table tournament_secrets enable row level security;
-- No policies → only the service-role key (used server-side) can read/write.

-- 7. Global backstop — singleton row tracking rough platform spend against a
--    hard cap (~CHF 50). When cents_spent crosses hard_cap_cents the app flips
--    kill_switch and blocks new free-tier generation until the window resets.
create table if not exists platform_usage (
  id int primary key default 1 check (id = 1),
  cents_spent int not null default 0,
  window_start timestamptz not null default now(),
  hard_cap_cents int not null default 5000,
  kill_switch boolean not null default false
);
insert into platform_usage (id) values (1) on conflict (id) do nothing;

-- Note: tournaments keeps its existing public-read RLS (migration 0001) so the
-- code-based stage/play/join views keep working. Admin writes go through the
-- service-role key and are scoped by owner_id in application code.
