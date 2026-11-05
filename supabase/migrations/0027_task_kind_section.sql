-- Project Manual: spec sections are a new top-level kind of work, alongside sheets and general tasks.
-- Add-only: existing rows are untouched.
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in ('sheet', 'view', 'section', 'task', 'item'));
