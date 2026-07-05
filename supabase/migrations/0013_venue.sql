-- =============================================================
-- Venue: tournaments can be played in one room (projector stage,
-- 'onsite') or fully remote ('online'). Online tournaments surface a
-- "watch the stage" link on every participant's device instead of
-- assuming a shared projector. Gameplay/data flow is identical.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

alter table tournaments
  add column venue text not null default 'onsite'
    check (venue in ('onsite', 'online'));
