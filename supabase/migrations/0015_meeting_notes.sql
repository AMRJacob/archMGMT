-- Meeting notes, kept with the project. A note can belong to a milestone or task (e.g. "Owner SD review").
-- Add-only: a new table; nothing existing changes.
create table if not exists meeting_notes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  task_id       uuid references tasks(id) on delete set null,
  meeting_date  date not null default current_date,
  title         text not null default '',
  attendees     text,
  body          text,
  author        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists meeting_notes_project_idx on meeting_notes (project_id);
create index if not exists meeting_notes_task_idx on meeting_notes (task_id);

alter table meeting_notes enable row level security;
drop policy if exists "members only" on meeting_notes;
create policy "members only" on meeting_notes for all to authenticated
  using (private.is_member()) with check (private.is_member());
