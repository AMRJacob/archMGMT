-- Views are gone: a sheet holds tasks, and tasks hold subtasks (kind 'item'), the same as general tasks and
-- spec sections. Each existing view becomes a task under its sheet, and the tasks that were under the view
-- become that task's subtasks.
update tasks set kind = 'item', effort = null
  where kind = 'task' and parent_id in (select id from tasks where kind = 'view');
update tasks set kind = 'task' where kind = 'view';
alter table tasks drop constraint if exists tasks_kind_check;
alter table tasks add constraint tasks_kind_check check (kind in ('sheet', 'section', 'task', 'item'));
