-- =============================================================
-- Track how often each task has been used in its tournament so we can
-- rotate fairly: replays prefer tasks with the lowest use count, only
-- repeating once every other task in the round has been used.
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tasks
  add column use_count int not null default 0;

-- Backfill: count each match's current task assignment so existing in-progress
-- tournaments behave correctly under the new rule.
update tasks t
set use_count = sub.cnt
from (
  select task_id, count(*)::int as cnt
  from matches
  where task_id is not null
  group by task_id
) sub
where t.id = sub.task_id;
