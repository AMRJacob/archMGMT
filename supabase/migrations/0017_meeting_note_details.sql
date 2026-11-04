-- Meeting notes get structure: attendees from the Team list, meeting type, location, decisions and action items.
-- Add-only.
alter table meeting_notes add column if not exists attendee_ids uuid[] not null default '{}';
alter table meeting_notes add column if not exists meeting_type text;
alter table meeting_notes add column if not exists location text;
alter table meeting_notes add column if not exists decisions text;
alter table meeting_notes add column if not exists actions jsonb not null default '[]'::jsonb;
