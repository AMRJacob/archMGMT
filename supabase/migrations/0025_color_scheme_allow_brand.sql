-- The colour-scheme rule (0002) only allowed balanced / triad / complementary, so brand colour schemes
-- ("brand:Name|#aaa,#bbb") were refused and snapped back. Allow them too. No data changed.
alter table public.projects drop constraint if exists projects_color_scheme_check;
alter table public.projects add constraint projects_color_scheme_check
  check (color_scheme is null or color_scheme in ('balanced', 'triad', 'complementary') or color_scheme like 'brand:%');
