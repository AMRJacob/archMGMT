-- Hierarchy inside a phase: sheet → view → task → item, all in the tasks table.
-- Add-only: existing rows become top-level tasks (kind 'task', no parent).
alter table tasks add column if not exists parent_id uuid references tasks(id) on delete cascade;
alter table tasks add column if not exists kind text not null default 'task'
  check (kind in ('sheet', 'view', 'task', 'item'));
alter table tasks add column if not exists sheet_number text;
alter table tasks add column if not exists sheet_type text;
alter table tasks add column if not exists notes text;
create index if not exists tasks_parent_id_idx on tasks (parent_id);
