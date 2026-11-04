-- Wishlist / problem reports (Settings → Wishlist & problems) and saved brand colour palettes. Add-only.

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins a where a.email = lower(auth.jwt() ->> 'email'))
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create table if not exists wishlist (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'wish' check (kind in ('wish', 'problem')),
  title         text not null,
  details       text,
  status        text not null default 'new'
                check (status in ('new', 'under_review', 'planned', 'in_progress', 'complete', 'infeasible', 'duplicate')),
  response      text,
  submitted_by  text,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table wishlist enable row level security;
-- Everyone signed in can see the list and add to it; the person who wrote an item, or an admin, can change it;
-- only admins delete.
create policy "members read" on wishlist for select to authenticated using (private.is_member());
create policy "members add" on wishlist for insert to authenticated with check (private.is_member());
create policy "author or admin edits" on wishlist for update to authenticated
  using (private.is_admin() or submitted_by = lower(auth.jwt() ->> 'email'))
  with check (private.is_member());
create policy "admin deletes" on wishlist for delete to authenticated using (private.is_admin());

create table if not exists brand_palettes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  colors      text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now()
);
alter table brand_palettes enable row level security;
create policy "members only" on brand_palettes for all to authenticated
  using (private.is_member()) with check (private.is_member());

-- Lets the app ask whether the signed-in person is an admin (to show status controls).
create or replace function public.am_i_admin() returns boolean
language sql stable security definer set search_path = public as $$ select private.is_admin() $$;
revoke all on function public.am_i_admin() from public, anon;
grant execute on function public.am_i_admin() to authenticated;
