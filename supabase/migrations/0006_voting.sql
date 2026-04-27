-- =============================================================
-- Audience voting:
--   * `votes` table stores one row per (match, voter)
--   * RLS enabled but NO select policy for anon — counts are server-side only
--     so the live tally never leaks during voting.
--   * Final tallies (`votes_a`, `votes_b`) are written onto the match row when
--     voting closes; stage reads those for the reveal animation.
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

create table votes (
  id                    uuid primary key default gen_random_uuid(),
  match_id              uuid not null references matches(id) on delete cascade,
  voter_participant_id  uuid not null references participants(id) on delete cascade,
  choice                text not null check (choice in ('A', 'B')),
  created_at            timestamptz not null default now(),
  unique (match_id, voter_participant_id)
);
create index votes_match_idx on votes(match_id);

alter table matches add column votes_a int;
alter table matches add column votes_b int;

-- RLS: enable, no select policy for anon → counts hidden during voting.
-- Server actions use the service-role key to read/write.
alter table votes enable row level security;
