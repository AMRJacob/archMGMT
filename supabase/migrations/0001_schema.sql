-- archMGMT schema: one firm, everyone signed in can see and edit everything.
-- Run once in Supabase → SQL Editor.

-- People at the firm. Linked to a Supabase sign-in when they have one.
create table people (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique references auth.users(id) on delete set null,
  name            text not null,
  initials        text,
  role            text,                       -- Principal, PM, Architect, Designer, Intern…
  weekly_hours    numeric not null default 40, -- capacity used by the workload view
  color           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table projects (
  id              uuid primary key default gen_random_uuid(),
  number          text,                       -- firm project number, e.g. 2026-014
  name            text not null,
  client          text,
  status          text not null default 'active'
                  check (status in ('pursuit','active','on_hold','complete')),
  pm_id           uuid references people(id) on delete set null,
  color           text,
  start_date      date,
  end_date        date,
  notes           text,
  created_at      timestamptz not null default now()
);

-- Phases: SD, DD, CD, Bidding, CA… The bars a client sees on the Gantt chart.
create table phases (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  name            text not null,
  sort_order      int not null default 0,
  start_date      date not null,
  end_date        date not null check (end_date >= start_date),
  client_visible  boolean not null default true
);

-- Tasks: internal work inside a phase. Hours feed the workload view.
create table tasks (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  phase_id        uuid references phases(id) on delete set null,
  title           text not null,
  assignee_id     uuid references people(id) on delete set null,
  start_date      date,
  due_date        date,
  estimated_hours numeric,
  status          text not null default 'todo'
                  check (status in ('todo','in_progress','review','done')),
  is_milestone    boolean not null default false, -- shown as a diamond (submittals, owner reviews, bid day)
  client_visible  boolean not null default false,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- Days someone is out, so their capacity drops that week.
create table time_off (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references people(id) on delete cascade,
  start_date      date not null,
  end_date        date not null check (end_date >= start_date),
  note            text
);

create index on phases (project_id);
create index on tasks (project_id);
create index on tasks (assignee_id);
create index on time_off (person_id);

-- Access: any signed-in firm member can read and write. Sign-up is invite-only
-- (turn off public sign-ups in Supabase → Authentication → Providers).
do $$
declare t text;
begin
  foreach t in array array['people','projects','phases','tasks','time_off'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "firm members" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
