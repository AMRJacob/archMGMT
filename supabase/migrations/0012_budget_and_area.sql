-- Project budget (construction budget, dollars) and gross area (square feet). Add-only; empty = not set.
alter table projects add column if not exists budget numeric;
alter table projects add column if not exists gross_area numeric;
