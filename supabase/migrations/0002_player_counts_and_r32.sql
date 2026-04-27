-- =============================================================
-- Add player counts 2, 4, 32 and the R32 round.
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

-- tournaments.player_count: allow 2, 4, 8, 16, 32
alter table tournaments drop constraint tournaments_player_count_check;
alter table tournaments
  add constraint tournaments_player_count_check
  check (player_count in (2, 4, 8, 16, 32));

-- tasks.round: add R32
alter table tasks drop constraint tasks_round_check;
alter table tasks
  add constraint tasks_round_check
  check (round in ('R32', 'R16', 'QF', 'SF', 'FINAL'));

-- matches.round: add R32
alter table matches drop constraint matches_round_check;
alter table matches
  add constraint matches_round_check
  check (round in ('R32', 'R16', 'QF', 'SF', 'FINAL'));
