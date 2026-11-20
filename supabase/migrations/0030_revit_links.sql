-- Revit add-in: a sheet (or a task that stands for a view) remembers the Revit element it belongs to, and a
-- project remembers which Revit models are its own. Both are Revit UniqueIds, which are the same for everyone
-- working in a shared model, so nothing has to be written into the .rvt.
alter table tasks add column if not exists revit_id text;
create index if not exists tasks_revit_id_idx on tasks (project_id, revit_id) where revit_id is not null;
alter table projects add column if not exists revit_models text[] not null default '{}';
