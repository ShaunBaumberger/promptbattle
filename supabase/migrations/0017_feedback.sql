-- =============================================================
-- Host feedback. Every message from the in-app feedback dialog is
-- stored here (so nothing is lost if the notification email fails)
-- and emailed to the operator. The table also backs a per-host rate
-- limit. RLS on with no policies: only the server (service role) can
-- read or write it.
--
-- Apply via Supabase Dashboard → SQL Editor → New query → paste → Run.
-- =============================================================

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  message text not null check (char_length(message) between 1 and 4000),
  page text,
  locale text,
  allow_contact boolean not null default true,
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists feedback_user_created_idx on feedback (user_id, created_at desc);

alter table feedback enable row level security;
