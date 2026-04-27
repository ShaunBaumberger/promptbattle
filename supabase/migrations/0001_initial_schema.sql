-- =============================================================
-- Prompt Battle MVP — initial schema
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run
-- =============================================================

-- -------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------

create table tournaments (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique not null,
  name                text not null,
  player_count        int  not null check (player_count in (8, 16)),
  round_time_seconds  int  not null default 60,
  status              text not null default 'setup'
                          check (status in ('setup', 'live', 'finished')),
  current_match_id    uuid,
  created_at          timestamptz not null default now()
);

create table participants (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references tournaments(id) on delete cascade,
  name            text not null,
  is_player       boolean not null default false,
  joined_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);
create index participants_tournament_idx on participants(tournament_id);

create table tasks (
  id                    uuid primary key default gen_random_uuid(),
  tournament_id         uuid not null references tournaments(id) on delete cascade,
  reference_image_url   text not null,
  internal_label        text,
  round                 text not null check (round in ('R16', 'QF', 'SF', 'FINAL')),
  created_at            timestamptz not null default now()
);
create index tasks_tournament_idx on tasks(tournament_id);

create table matches (
  id                    uuid primary key default gen_random_uuid(),
  tournament_id         uuid not null references tournaments(id) on delete cascade,
  round                 text not null check (round in ('R16', 'QF', 'SF', 'FINAL')),
  bracket_position      int  not null,
  player_a_id           uuid references participants(id) on delete set null,
  player_b_id           uuid references participants(id) on delete set null,
  task_id               uuid references tasks(id) on delete set null,
  -- denormalized URL: only populated by server when match transitions to 'live'
  -- so clients cannot pre-fetch reference images for upcoming matches
  task_reference_url    text,
  prompt_a              text not null default '',
  prompt_b              text not null default '',
  result_a_url          text,
  result_b_url          text,
  winner_id             uuid references participants(id) on delete set null,
  status                text not null default 'pending'
                            check (status in (
                              'pending', 'live', 'locked',
                              'generating', 'reveal', 'voting', 'done'
                            )),
  start_time            timestamptz,
  end_time              timestamptz,
  created_at            timestamptz not null default now()
);
create index matches_tournament_idx on matches(tournament_id);
create index matches_status_idx     on matches(status);

-- circular FK: tournaments.current_match_id → matches.id
alter table tournaments
  add constraint tournaments_current_match_fk
  foreign key (current_match_id)
  references matches(id)
  on delete set null;

-- -------------------------------------------------------------
-- Realtime publication: enable change-data-capture for relevant tables
-- -------------------------------------------------------------
alter publication supabase_realtime add table tournaments;
alter publication supabase_realtime add table participants;
alter publication supabase_realtime add table matches;

-- -------------------------------------------------------------
-- Row Level Security
-- All writes go through server-side route handlers using the service-role key
-- (which bypasses RLS). Anonymous clients only get read access.
-- -------------------------------------------------------------

alter table tournaments  enable row level security;
alter table participants enable row level security;
alter table tasks        enable row level security;
alter table matches      enable row level security;

-- Public read on tournaments, participants, matches (needed for realtime + lobby)
create policy "tournaments_select_all"  on tournaments  for select using (true);
create policy "participants_select_all" on participants for select using (true);
create policy "matches_select_all"      on matches      for select using (true);

-- Tasks are NOT publicly readable: would let players preview reference images
-- for upcoming matches. Server fetches via service-role and writes the URL onto
-- the match row when the match transitions to 'live'.
-- (No select policy = anon clients see no rows)

-- -------------------------------------------------------------
-- Storage bucket for reference images + generated outputs
-- Public bucket; security relies on URLs only being exposed on match rows
-- once the match goes live (and being deleted when tournament ends).
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do nothing;
