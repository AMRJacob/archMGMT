-- Checklist items and milestones carry no size: allow effort to be empty (it still defaults to medium).
alter table tasks alter column effort drop not null;
