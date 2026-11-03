-- Keep the access check out of the public API: move it into a schema the API doesn't expose.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') like '%@amr-architects.com'
    or exists (select 1 from public.app_access a where a.email = lower(auth.jwt() ->> 'email')),
    false)
$$;
revoke all on function private.is_member() from public, anon;
grant execute on function private.is_member() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['people','projects','phases','tasks','time_off'] loop
    execute format('drop policy if exists "members only" on %I', t);
    execute format('create policy "members only" on %I for all to authenticated using (private.is_member()) with check (private.is_member())', t);
  end loop;
end $$;

drop function if exists public.is_member();
