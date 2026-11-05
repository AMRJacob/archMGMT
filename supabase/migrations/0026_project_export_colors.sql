-- Custom presentation colours per project (background, cells, headings & accent, text) for the
-- presentation view, PDF and PNG. Adds a column only.
alter table public.projects add column if not exists export_colors jsonb not null default '{}'::jsonb;
