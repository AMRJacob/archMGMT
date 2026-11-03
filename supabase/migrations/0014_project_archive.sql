-- Archive a project before deleting it: archived projects drop out of lists, the switcher and workload,
-- but keep all their data and can be restored. Add-only; empty = not archived.
alter table projects add column if not exists archived_at timestamptz;
