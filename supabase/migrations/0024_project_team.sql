-- Each project's team (people ids). When set, task assignment lists the team first. Adds a column only.
alter table public.projects add column if not exists team uuid[] not null default '{}';
