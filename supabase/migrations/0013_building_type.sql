-- Building type (education, office, healthcare…). Add-only; empty = not set.
alter table projects add column if not exists building_type text;
