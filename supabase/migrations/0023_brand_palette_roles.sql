-- Brand palettes: which brand colour paints which part of a presented / printed schedule
-- (background, row bands, headings & accent, text). Empty = worked out automatically. Adds a column only.
alter table public.brand_palettes add column if not exists roles jsonb not null default '{}'::jsonb;
