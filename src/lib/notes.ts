import { today } from './dates.ts'
import type { MeetingNote, Task } from './types.ts'

/** A new note's starting values, optionally for a milestone or task. */
export function newNote(projectId: string, task: Task | null, author: string | null): Partial<MeetingNote> {
  return {
    project_id: projectId, task_id: task?.id ?? null,
    meeting_date: task?.due_date && task.is_milestone ? task.due_date : today(),
    title: task ? task.title : '', attendees: null, body: null, author,
  }
}
