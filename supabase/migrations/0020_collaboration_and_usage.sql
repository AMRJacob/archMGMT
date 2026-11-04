-- Live collaboration: every change records when and by whom; the shared tables broadcast changes.
-- Adds columns only; no data is changed.
alter table public.projects      add column if not exists updated_at timestamptz not null default now(), add column if not exists updated_by uuid default auth.uid();
alter table public.phases        add column if not exists updated_at timestamptz not null default now(), add column if not exists updated_by uuid default auth.uid();
alter table public.tasks         add column if not exists updated_at timestamptz not null default now(), add column if not exists updated_by uuid default auth.uid();
alter table public.people        add column if not exists updated_at timestamptz not null default now(), add column if not exists updated_by uuid default auth.uid();
alter table public.meeting_notes add column if not exists updated_at timestamptz not null default now();
alter table public.meeting_notes add column if not exists updated_by uuid default auth.uid();

create or replace function private.touch() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['projects','phases','tasks','people','meeting_notes'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$I', t);
    execute format('create trigger touch_%1$s before insert or update on public.%1$I for each row execute function private.touch()', t);
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- How much of the plan's database space is used (Settings). Members only.
create or replace function public.storage_usage() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  if not private.is_member() then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'database_bytes', pg_database_size(current_database()),
    'tables', coalesce(jsonb_agg(jsonb_build_object('name', c.relname, 'bytes', pg_total_relation_size(c.oid), 'rows', c.reltuples::bigint) order by pg_total_relation_size(c.oid) desc), '[]'::jsonb)
  ) into r
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r';
  return r;
end $$;
revoke all on function public.storage_usage() from public, anon;
grant execute on function public.storage_usage() to authenticated;
