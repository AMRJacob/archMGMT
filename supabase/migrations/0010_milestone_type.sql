-- Milestones can be typed (owner, internal, coordination, agency, contract) for colour on the schedule.
-- Add-only; empty means an untyped milestone.
alter table tasks add column if not exists milestone_type text;
