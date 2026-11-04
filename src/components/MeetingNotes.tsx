import { useState } from 'react'
import Modal from './Modal.tsx'
import { MilestoneMark } from './TaskChips.tsx'
import { formatDate } from '../lib/dates.ts'
import type { MeetingNote, Task } from '../lib/types.ts'

/** The list of a project's meeting notes, newest meeting first, on its Overview. */
export function MeetingNotesSection({ notes, tasks, onAdd, onOpen }: {
  notes: MeetingNote[]
  tasks: Task[]
  onAdd: () => void
  onOpen: (n: MeetingNote) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const sorted = [...notes].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const shown = showAll ? sorted : sorted.slice(0, 5)
  return (
    <section className="card notes-card">
      <div className="notes-head">
        <h2>Meeting notes</h2>
        <span className="muted small">{notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : 'Owner meetings, coordination calls, site visits: keep the notes here.'}</span>
        <span className="grow" />
        <button className="btn" onClick={onAdd}>+ New note</button>
      </div>
      {shown.length > 0 && (
        <ul className="note-list">
          {shown.map((n) => {
            const task = n.task_id ? tasks.find((t) => t.id === n.task_id) : undefined
            const first = (n.body ?? '').split('\n').find((l) => l.trim()) ?? ''
            return (
              <li key={n.id}>
                <button className="note-row" onClick={() => onOpen(n)}>
                  <span className="note-date">{formatDate(n.meeting_date)}</span>
                  <span className="note-main">
                    <span className="strong">{n.title || 'Meeting'}</span>
                    {task && <span className="note-link">{task.is_milestone && <MilestoneMark task={task} />}{task.title}</span>}
                    <span className="muted small note-first">{first || (n.attendees ? `With ${n.attendees}` : 'No notes yet')}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {sorted.length > 5 && <button className="linkbtn notes-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${sorted.length}`}</button>}
    </section>
  )
}

/** Writing a note: date, title, who was there, what it's about, and the notes themselves. Saves as you type. */
export function NoteEditor({ note, tasks, onPatch, onDelete, onClose }: {
  note: MeetingNote
  tasks: Task[]
  onPatch: (c: Partial<MeetingNote>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(note.title)
  const [attendees, setAttendees] = useState(note.attendees ?? '')
  const [body, setBody] = useState(note.body ?? '')
  const save = (c: Partial<MeetingNote>) => onPatch({ ...c, updated_at: new Date().toISOString() })
  const close = () => {
    const c: Partial<MeetingNote> = {}
    if (title !== note.title) c.title = title
    if (attendees !== (note.attendees ?? '')) c.attendees = attendees || null
    if (body !== (note.body ?? '')) c.body = body || null
    if (Object.keys(c).length) save(c)
    onClose()
  }
  // Milestones first (meetings usually are one), then other work, by date.
  const linkable = tasks.filter((t) => t.kind !== 'item')
    .sort((a, b) => Number(b.is_milestone) - Number(a.is_milestone) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  return (
    <Modal size="wide" onClose={close}
      title={<input className="field note-title" value={title} placeholder="Meeting title, e.g. Owner SD review" autoFocus={!note.title}
        onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== note.title && save({ title })} />}
      footer={
        <>
          <button className="btn danger" onClick={() => { if (window.confirm('Delete this meeting note?')) { onDelete(); onClose() } }}>Delete note</button>
          <span className="grow" />
          <span className="muted small">{note.author ? `Started by ${note.author}. ` : ''}Saved as you go.</span>
          <button className="btn primary" onClick={close}>Done</button>
        </>
      }>
      <div className="note-meta">
        <label>Date<input type="date" className="field boxed" value={note.meeting_date} onChange={(e) => e.target.value && save({ meeting_date: e.target.value })} /></label>
        <label>For
          <select className="field boxed" value={note.task_id ?? ''} onChange={(e) => save({ task_id: e.target.value || null })}>
            <option value="">The project in general</option>
            {linkable.map((t) => <option key={t.id} value={t.id}>{t.is_milestone ? '◆ ' : ''}{t.title}{t.due_date ? ` (${formatDate(t.due_date)})` : ''}</option>)}
          </select>
        </label>
        <label className="grow">Attendees<input className="field boxed" value={attendees} placeholder="Who was there"
          onChange={(e) => setAttendees(e.target.value)} onBlur={() => attendees !== (note.attendees ?? '') && save({ attendees: attendees || null })} /></label>
      </div>
      <textarea className="field boxed note-body" value={body} autoFocus={Boolean(note.title)}
        placeholder={'Notes, decisions and action items…\n\n- Decision: …\n- Action: Ralph to send revised plan by Friday'}
        onChange={(e) => setBody(e.target.value)} onBlur={() => body !== (note.body ?? '') && save({ body: body || null })} />
    </Modal>
  )
}

