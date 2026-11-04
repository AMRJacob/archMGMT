import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { formatDate } from '../lib/dates.ts'
import { useTitleBlock, type TitleBlock } from '../lib/titleBlock.ts'
import { MEETING_TYPES, type MeetingNote, type Person, type Project, type Task } from '../lib/types.ts'

/** The title block at the top of a printed note (placeholder until the CAzen title block creator comes over). */
export function TitleBlockView({ tb, project, title, date, kind }: { tb: TitleBlock; project: Project | null; title: string; date: string; kind?: string | null }) {
  return (
    <header className="tb">
      <div className="tb-firm">
        <strong>{tb.firm}</strong>
        {[tb.address, tb.phone, tb.website].filter(Boolean).map((l) => <span key={l}>{l}</span>)}
      </div>
      <div className="tb-doc">
        <span className="tb-kicker">Meeting notes{kind ? ` · ${kind}` : ''}</span>
        <strong className="tb-title">{title || 'Meeting'}</strong>
        <span>{formatDate(date)}</span>
      </div>
      <div className="tb-project">
        <span className="tb-kicker">Project</span>
        <strong>{project?.name ?? ''}</strong>
        {project?.number && <span>No. {project.number}</span>}
        {project?.client && <span>{project.client}</span>}
      </div>
    </header>
  )
}

/**
 * A meeting note laid out for paper, then the print dialog (choose "Save as PDF"). Rendered at the top of the
 * page only while printing; the page is set to letter portrait for it.
 */
export default function NotePrint({ note, project, people, tasks, onDone }: {
  note: MeetingNote
  project: Project | null
  people: Person[]
  tasks: Task[]
  onDone: () => void
}) {
  const tb = useTitleBlock()
  useEffect(() => {
    document.body.classList.add('printing-note')
    const page = document.createElement('style')
    page.textContent = '@page { size: letter portrait; margin: 0.6in; }'
    document.head.appendChild(page)
    const done = () => { document.body.classList.remove('printing-note'); page.remove(); onDone() }
    window.addEventListener('afterprint', done, { once: true })
    const t = setTimeout(() => window.print(), 50)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-note'); page.remove() }
  }, [onDone])

  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? ''
  const team = (note.attendee_ids ?? []).map((id) => people.find((p) => p.id === id)).filter((p): p is Person => Boolean(p))
  const guests = (note.attendees ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const task = note.task_id ? tasks.find((t) => t.id === note.task_id) : undefined
  const kind = MEETING_TYPES.find((m) => m.value === note.meeting_type)?.label
  const actions = note.actions ?? []
  const decisions = (note.decisions ?? '').split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)

  return createPortal(
    <div className="note-print">
      <TitleBlockView tb={tb} project={project} title={note.title} date={note.meeting_date} kind={kind} />
      <table className="np-meta">
        <tbody>
          {note.location && <tr><th>Where</th><td>{note.location}</td></tr>}
          {task && <tr><th>For</th><td>{task.title}</td></tr>}
          <tr>
            <th>Attendees</th>
            <td>{[...team.map((p) => `${p.name}${p.company ? ` (${p.company})` : p.kind === 'staff' ? ` (${tb.firm})` : ''}`), ...guests].join('; ') || '—'}</td>
          </tr>
        </tbody>
      </table>
      {note.body && <section><h2>Notes</h2><div className="np-body">{note.body}</div></section>}
      {decisions.length > 0 && <section><h2>Decisions</h2><ol>{decisions.map((d, i) => <li key={i}>{d}</li>)}</ol></section>}
      {actions.length > 0 && (
        <section>
          <h2>Action Items</h2>
          <table className="np-actions">
            <thead><tr><th style={{ width: '4%' }} /><th>Item</th><th style={{ width: '22%' }}>Who</th><th style={{ width: '16%' }}>Due</th></tr></thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id}><td>{a.done ? '☑' : '☐'}</td><td>{a.text}</td><td>{name(a.who)}</td><td>{a.due ? formatDate(a.due) : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <footer className="np-foot">
        <span>{tb.footer}</span>
        <span>{note.author ? `Prepared by ${note.author}` : ''}</span>
      </footer>
    </div>,
    document.body,
  )
}
