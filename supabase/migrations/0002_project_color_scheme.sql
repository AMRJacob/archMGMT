-- How a project's phase colours are built from its root colour.
-- Add-only: existing projects keep working with the default ('balanced').
alter table projects add column if not exists color_scheme text
  check (color_scheme is null or color_scheme in ('balanced', 'triad', 'complementary'));
