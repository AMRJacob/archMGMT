-- More than one person can be on a task. assignee_ids holds everyone; assignee_id stays as the
-- first (lead) person so older code and backups keep working. Add-only: nothing is removed.
alter table tasks add column if not exists assignee_ids uuid[] not null default '{}';

update tasks set assignee_ids = array[assignee_id]
where assignee_id is not null and assignee_ids = '{}';

-- When a person is removed, take them off every task they were on (assignee_id already clears itself).
create or replace function private.unassign_removed_person() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update tasks set assignee_ids = array_remove(assignee_ids, old.id) where old.id = any(assignee_ids);
  return old;
end $$;

drop trigger if exists people_unassign on people;
create trigger people_unassign after delete on people
for each row execute function private.unassign_removed_person();

create index if not exists tasks_assignee_ids_idx on tasks using gin (assignee_ids);
