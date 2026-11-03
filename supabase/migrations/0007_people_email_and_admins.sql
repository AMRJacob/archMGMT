-- Sign-in links from the app (no email service): people get an email address, and a short list of
-- admins may create sign-in links (supabase/functions/sign-in-link). Add-only.
alter table people add column if not exists email text;

create table if not exists app_admins (
  email     text primary key,
  added_at  timestamptz not null default now()
);
alter table app_admins enable row level security;
-- No policies: read only by the sign-in-link function (service role) and the dashboard.

insert into app_admins (email) values ('jacob@amr-architects.com') on conflict do nothing;
