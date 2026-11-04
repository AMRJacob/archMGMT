-- Who Has Access: show when each person last opened the app and last changed something, not just when
-- they last signed in (sign-ins are rare because sessions are remembered). Adds only; no data changed.

-- Last opened: the app reports in when it opens (at most about once an hour per browser).
create table if not exists public.user_activity (
  email         text primary key,
  last_seen_at  timestamptz not null default now()
);
alter table public.user_activity enable row level security;
-- No direct access from the app; it goes through the functions below.

create or replace function public.note_activity() returns void
language plpgsql security definer set search_path = '' as $$
declare e text := lower(auth.jwt() ->> 'email');
begin
  if e is null or not private.is_member() then return; end if;
  insert into public.user_activity (email, last_seen_at) values (e, now())
  on conflict (email) do update set last_seen_at = excluded.last_seen_at;
end $$;
revoke all on function public.note_activity() from public, anon;
grant execute on function public.note_activity() to authenticated;

-- Last edit: the newest change each account made, from the updated_by / updated_at columns (0020).
-- For the sign-in-link function (service role) only.
create or replace function public.last_edits() returns table (user_id uuid, last_edit_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select updated_by, max(updated_at) from (
    select updated_by, updated_at from public.projects union all
    select updated_by, updated_at from public.phases union all
    select updated_by, updated_at from public.tasks union all
    select updated_by, updated_at from public.people union all
    select updated_by, updated_at from public.meeting_notes
  ) x where updated_by is not null group by updated_by
$$;
revoke all on function public.last_edits() from public, anon, authenticated;
grant execute on function public.last_edits() to service_role;
