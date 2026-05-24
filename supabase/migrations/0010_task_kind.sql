-- =============================================================
-- Task type as a first-class column.
--   * tasks.kind: 'image' | 'text' | 'video' — the new third type
--     generates a video (Veo) instead of an image (Nano Banana).
--     Video tasks use a text prompt as input, same as text tasks,
--     but the OUTPUT is a video.
--   * matches.task_kind: denormalized at match-prep time so the
--     stage/player/admin can branch on it without joining tasks.
--
-- Backfill: existing rows are inferred from which content field is
-- set (text_prompt → text, otherwise image). No existing rows are
-- video tasks.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tasks
  add column kind text not null default 'image'
    check (kind in ('image', 'text', 'video'));

update tasks
set kind = 'text'
where text_prompt is not null;

alter table matches
  add column task_kind text
    check (task_kind in ('image', 'text', 'video'));

-- Backfill matches' task_kind from the tasks they reference.
update matches m
set task_kind = t.kind
from tasks t
where m.task_id = t.id;
