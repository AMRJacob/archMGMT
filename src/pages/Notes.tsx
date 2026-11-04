import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { NoteRow } from '../components/MeetingNotes.tsx'
import { useProject } from '../lib/projectContext.ts'
import { useProjectPlan } from '../lib/useProjectPlan.ts'
import { useNotes } from '../lib/useNotes.tsx'
import { MEETING_TYPES } from '../lib/types.ts'

/** The project's meeting notes: search, filter by kind of meeting, open actions at a glance. */
export default function Notes() {
  const { current: project } = useProject()
  const plan = useProjectPlan(project?.id ?? '')
  const nh = useNotes(project?.id ?? '', plan.tasks.rows, plan.phases.rows, plan.people.rows, () => void plan.tasks.reload())
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  // ?open=<note id> (from search) opens that note.
  const [params, setParams] = useSearchParams()
  const openId = params.get('open')
  const { open: openNote } = nh
  useEffect(() => {
    if (!openId || !nh.notes.rows.some((n) => n.id === openId)) return
    openNote(openId); params.delete('open'); setParams(params, { replace: true })
  }, [openId, nh.notes.rows]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!project) return <p>No project chosen. <Link to="/">See all projects</Link></p>

  const query = q.trim().toLowerCase()
  const people = plan.people.rows
  const shown = [...nh.notes.rows]
    .filter((n) => !type || n.meeting_type === type)
    .filter((n) => !query || [n.title, n.body, n.decisions, n.attendees, n.location, ...(n.actions ?? []).map((a) => a.text),
      ...(n.attendee_ids ?? []).map((id) => people.find((p) => p.id === id)?.name)].some((v) => (v ?? '').toLowerCase().includes(query)))
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const openActions = nh.notes.rows.flatMap((n) => (n.actions ?? []).filter((a) => !a.done).map((a) => ({ a, n })))

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Meeting notes</h1>
          <p className="muted">{[project.number, project.name].filter(Boolean).join(' · ')}</p>
        </div>
        <button className="btn primary" onClick={() => void nh.add(null)}>+ New note</button>
      </header>

      <div className="list-filters">
        <input className="field boxed search" type="search" placeholder="Search notes, decisions, people…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`filter-chip${type === '' ? ' on' : ''}`} onClick={() => setType('')}>All</button>
        {MEETING_TYPES.filter((m) => nh.notes.rows.some((n) => n.meeting_type === m.value)).map((m) => (
          <button key={m.value} className={`filter-chip${type === m.value ? ' on' : ''}`} onClick={() => setType(type === m.value ? '' : m.value)}>{m.label}</button>
        ))}
        <span className="grow" />
        <span className="muted small">{shown.length} of {nh.notes.rows.length}</span>
      </div>

      <div className="notes-layout">
        <div className="card notes-card">
          {shown.length === 0
            ? <p className="muted empty">{nh.notes.rows.length ? 'No notes match.' : 'No meeting notes yet. Start one here, or right-click a milestone in Overview or on the Schedule.'}</p>
            : <ul className="note-list">{shown.map((n) => <li key={n.id}><NoteRow n={n} tasks={plan.tasks.rows} people={people} onOpen={() => nh.open(n.id)} /></li>)}</ul>}
        </div>
        {openActions.length > 0 && (
          <aside className="card notes-card open-actions">
            <h2>Open action items</h2>
            <ul>
              {openActions.map(({ a, n }) => (
                <li key={a.id}>
                  <button className="linkbtn" onClick={() => nh.open(n.id)}>{a.text}</button>
                  <span className="muted small">{[people.find((p) => p.id === a.who)?.name, a.due && `due ${a.due}`, n.title].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
      {nh.editor}
    </section>
  )
}
