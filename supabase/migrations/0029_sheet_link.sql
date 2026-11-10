-- Sheets carried through phases: each phase has its own row for a sheet (so that phase's work shows there),
-- and rows sharing a sheet_link are the same drawing. The app keeps their number, name and type in step.
alter table tasks add column if not exists sheet_link uuid;
create index if not exists tasks_sheet_link_idx on tasks (sheet_link) where sheet_link is not null;
