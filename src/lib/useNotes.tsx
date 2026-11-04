import { useState } from 'react'
import { NoteEditor } from '../components/MeetingNotes.tsx'
import { useAuth } from '../auth/authContext.ts'
import { insert, useRows } from './data.ts'
import { newNote } from './notes.ts'
import { today } from './dates.ts'
import { assigneesOf } from './assignees.ts'
import type { MeetingNote, Person, Phase, Task } from './types.ts'

/**
 * A project's meeting notes plus the editor for them, for any page that shows notes:
 * `add(task?)` starts a note (optionally for a milestone), `open(id)` opens one, render `editor`.
 */
export function useNotes(projectId: string, tasks: Task[], phases: Phase[], people: Person[], reloadTasks?: () => void) {
  const notes = useRows<MeetingNote>('meeting_notes', { project_id: projectId })
  const { session } = useAuth()
  const [openId, setOpenId] = useState<string | null>(null)

  const add = async (task: Task | null) => {
    // Start with whoever is writing it and, for a milestone or task, the people on it.
    const email = session?.user.email?.toLowerCase()
    const me = email ? people.find((p) => (p.email ?? '').toLowerCase() === email) : undefined
    const on = task ? assigneesOf(task) : []
    const n = await notes.add({ ...newNote(projectId, task, session?.user.email ?? null), attendee_ids: [...new Set([...(me ? [me.id] : []), ...on])], actions: [] })
    setOpenId(n.id)
  }
  const forTask = (t: Task) => notes.rows.filter((n) => n.task_id === t.id)
  const latestFor = (t: Task) => [...forTask(t)].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))[0]

  const note = openId ? notes.rows.find((n) => n.id === openId) : undefined
  const editor = note ? (
    <NoteEditor key={note.id} note={note} tasks={tasks} people={people}
      onPatch={(c) => void notes.patch(note.id, c)} onDelete={() => void notes.drop(note.id)} onClose={() => setOpenId(null)}
      onMakeTask={async (a) => {
        // The phase the due date falls in, else the one under way, else the first.
        const d = a.due ?? today()
        const sorted = [...phases].sort((x, y) => x.start_date.localeCompare(y.start_date))
        const phase = sorted.find((p) => p.start_date <= d && d <= p.end_date) ?? sorted.find((p) => p.end_date >= d) ?? sorted[0]
        const t = await insert<Task>('tasks', {
          project_id: projectId, phase_id: phase?.id ?? null, parent_id: null, kind: 'task', title: a.text,
          start_date: null, due_date: a.due, effort: 1, status: 'todo', is_milestone: false, client_visible: false,
          assignee_id: a.who, assignee_ids: a.who ? [a.who] : [], estimated_hours: null, sort_order: tasks.length,
          notes: `From meeting: ${note.title || 'meeting'} (${note.meeting_date})`,
        })
        reloadTasks?.()
        return t.id
      }} />
  ) : null

  return { notes, add, open: setOpenId, forTask, latestFor, editor }
}
