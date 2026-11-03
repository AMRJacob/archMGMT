-- Workload without hours (hours live in Monograph): tasks get a size, people an availability.
-- Add-only: estimated_hours and weekly_hours stay in place, unused by the app.
alter table tasks add column if not exists effort smallint not null default 2
  check (effort between 1 and 3);
alter table people add column if not exists availability smallint not null default 100
  check (availability between 0 and 100);
