-- Who may use archMGMT's data: anyone signed in with an @amr-architects.com email, plus any
-- address added to app_access (for consultants or other outside users later).
-- This holds even if someone manages to create an account on their own.

create table if not exists app_access (
  email      text primary key,
  note       text,
  added_at   timestamptz not null default now()
);
alter table app_access enable row level security;
-- No policies on app_access: it is managed from the Supabase dashboard / SQL editor only.

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') like '%@amr-architects.com'
    or exists (select 1 from app_access a where a.email = lower(auth.jwt() ->> 'email')),
    false)
$$;

revoke all on function public.is_member() from public;
grant execute on function public.is_member() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['people','projects','phases','tasks','time_off'] loop
    execute format('drop policy if exists "firm members" on %I', t);
    execute format('drop policy if exists "members only" on %I', t);
    execute format('create policy "members only" on %I for all to authenticated using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;
