-- =============================================================
-- Add text-based tasks (e.g. "Generate image of a pelican riding a bike").
-- A task is now either an image task (reference_image_url) OR a text task
-- (text_prompt) — exactly one column is populated.
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tasks alter column reference_image_url drop not null;
alter table tasks add column text_prompt text;

alter table tasks
  add constraint tasks_payload_check
  check (
    (reference_image_url is not null and text_prompt is null) or
    (reference_image_url is null and text_prompt is not null)
  );

-- Denormalised text payload on the match row, mirroring task_reference_url.
-- Populated by the server when the match transitions to `live` so clients
-- can't pre-read tasks for upcoming matches.
alter table matches add column task_text text;
