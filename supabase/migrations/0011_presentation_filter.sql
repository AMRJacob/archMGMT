-- What each project's presentation view shows: rules (all milestones, sheets, top-level tasks) plus
-- hand-picked items (tasks.client_visible) minus items hidden by hand. Add-only; empty uses the defaults.
alter table projects add column if not exists presentation jsonb;
