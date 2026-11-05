-- Wishlist: a priority for each item (1 low … 4 urgent), shown green to red. Adds a column only.
alter table public.wishlist add column if not exists priority smallint check (priority between 1 and 4);
