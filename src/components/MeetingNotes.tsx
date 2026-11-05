import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import NotePrint from './NotePrint.tsx'
import { useLockedBy } from '../lib/live.ts'
import Modal from './Modal.tsx'
import { MilestoneMark } from './TaskChips.tsx'
import { initialsOf } from '../lib/assignees.ts'
import { formatDate } from '../lib/dates.ts'
import { MEETING_TYPES, type ActionItem, type MeetingNote, type Person, type Project, type Task } from '../lib/types.ts'

const typeOf = (v: string | null | undefined) => MEETING_TYPES.find((m) => m.value === v) ?? null

/** One line per note: date, type, title, what it's for, who was there, how many open actions. */
export function NoteRow({ n, tasks, people, onOpen }: { n: MeetingNote; tasks: Task[]; people: Person[]; onOpen: () => void }) {
  const task = n.task_id ? tasks.find((t) => t.id === n.task_id) : undefined
  const mt = typeOf(n.meeting_type)
  const who = [...(n.attendee_ids ?? []).map((id) => people.find((p) => p.id === id)?.name).filter(Boolean), ...splitGuests(n.attendees)]
  const open = (n.actions ?? []).filter((a) => !a.done).length
  const first = (n.body ?? '').split('\n').find((l) => l.trim()) ?? ''
  return (
    <button className="note-row" onClick={onOpen}>
      <span className="note-date">{formatDate(n.meeting_date)}</span>
      <span className="note-main">
        <span className="note-title-line">
          {mt && <span className="note-type" style={{ ['--c' as string]: mt.color }}>{mt.label}</span>}
          <span className="strong">{n.title || 'Untitled meeting'}</span>
          {task && <span className="note-link">{task.is_milestone && <MilestoneMark task={task} />}{task.title}</span>}
        </span>
        <span className="muted small note-first">
          {[who.length ? who.join(', ') : '', first].filter(Boolean).join(' · ') || 'No notes yet'}
        </span>
      </span>
      {open > 0 && <span className="note-actions-count" title={`${open} open action item${open === 1 ? '' : 's'}`}>{open} open</span>}
    </button>
  )
}

const splitGuests = (s: string | null | undefined) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

/** Attendees: people from the Team list as chips (type to find them), plus guests typed in by name. */
function AttendeePicker({ ids, guests, people, onChange }: {
  ids: string[]
  guests: string[]
  people: Person[]
  onChange: (ids: string[], guests: string[]) => void
}) {
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const active = people.filter((p) => p.active || ids.includes(p.id))
  const query = q.trim().toLowerCase()
  const matches = query
    ? active.filter((p) => !ids.includes(p.id) && [p.name, p.company, p.role, p.email].some((v) => (v ?? '').toLowerCase().includes(query))).slice(0, 6)
    : []
  const addPerson = (p: Person) => { onChange([...ids, p.id], guests); setQ(''); setHi(0) }
  const addGuest = (name: string) => { if (name.trim()) onChange(ids, [...guests, name.trim()]); setQ(''); setHi(0) }
  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
    else if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      if (!q.trim()) return
      e.preventDefault()
      if (matches[hi]) addPerson(matches[hi]); else addGuest(q)
    } else if (e.key === 'Backspace' && !q) {
      if (guests.length) onChange(ids, guests.slice(0, -1))
      else if (ids.length) onChange(ids.slice(0, -1), guests)
    }
  }
  const staff = active.filter((p) => p.kind === 'staff' && !ids.includes(p.id))
  return (
    <div className="attendees">
      <div className="att-box">
        {ids.map((id) => {
          const p = people.find((x) => x.id === id)
          return (
            <span key={id} className="att-chip">
              <span className="avatar sm">{initialsOf(p)}</span>{p?.name ?? 'Removed person'}
              <button type="button" aria-label={`Remove ${p?.name ?? ''}`} onClick={() => onChange(ids.filter((x) => x !== id), guests)}>×</button>
            </span>
          )
        })}
        {guests.map((g, i) => (
          <span key={`${g}-${i}`} className="att-chip guest" title="Guest (not on the Team list)">
            {g}<button type="button" aria-label={`Remove ${g}`} onClick={() => onChange(ids, guests.filter((_, j) => j !== i))}>×</button>
          </span>
        ))}
        <span className="att-input">
          <input value={q} placeholder={ids.length || guests.length ? 'Add someone…' : 'Type a name: the Team list, or anyone else'}
            onChange={(e) => { setQ(e.target.value); setHi(0) }} onKeyDown={keys} onBlur={() => setTimeout(() => setQ(''), 150)} />
          {query && (
            <span className="att-suggest" role="listbox">
              {matches.map((p, i) => (
                <button key={p.id} type="button" role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''}
                  onMouseDown={(e) => { e.preventDefault(); addPerson(p) }}>
                  <span className="avatar sm">{initialsOf(p)}</span>{p.name}
                  <span className="pm-hint">{p.kind === 'consultant' ? p.company ?? 'Consultant' : p.role ?? 'Staff'}</span>
                </button>
              ))}
              <button type="button" role="option" aria-selected={hi === matches.length} className={hi === matches.length ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); addGuest(q) }}>
                Add “{q.trim()}” as a guest
              </button>
            </span>
          )}
        </span>
      </div>
      {staff.length > 0 && (
        <div className="att-quick">
          <span className="muted small">Add:</span>
          {staff.slice(0, 8).map((p) => {
            const first = p.name.split(' ')[0]
            const clash = staff.filter((x) => x.name.split(' ')[0] === first).length > 1
            return <button key={p.id} type="button" className="filter-chip" onClick={() => addPerson(p)}>+ {clash ? p.name : first}</button>
          })}
          {staff.length > 1 && <button type="button" className="linkbtn small" onClick={() => onChange([...ids, ...staff.map((p) => p.id)], guests)}>Everyone on staff</button>}
        </div>
      )}
    </div>
  )
}

/**
 * A meeting note: what kind of meeting, when and where, who was there (Team list + guests), what it's for,
 * then the notes, the decisions, and action items that can become tasks. Saves as you go.
 */
export function NoteEditor({ note, tasks, people, project, onPatch, onDelete, onClose, onMakeTask }: {
  project?: Project | null
  note: MeetingNote
  tasks: Task[]
  people: Person[]
  onPatch: (c: Partial<MeetingNote>) => void
  onDelete: () => void
  onClose: () => void
  /** Turn an action item into a task in the project; returns the new task's id. */
  onMakeTask?: (a: ActionItem) => Promise<string | null>
}) {
  const [title, setTitle] = useState(note.title)
  const [location, setLocation] = useState(note.location ?? '')
  const [body, setBody] = useState(note.body ?? '')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  /** Put the cursor at `pos` as soon as the new text is on screen (before the next keystroke lands). */
  const pendingCaret = useRef<number | null>(null)
  const caret = (pos: number) => { pendingCaret.current = pos }
  useLayoutEffect(() => {
    const el = bodyRef.current, pos = pendingCaret.current
    if (el && pos !== null) { pendingCaret.current = null; el.focus(); el.setSelectionRange(pos, pos) }
  }, [body])
  /**
   * Topic / item buttons: start a new line with "# " (a topic heading) or "• " (a bullet), right after the line
   * the cursor is on. A topic gets a blank line before it so topics read as separate blocks.
   */
  const insertLine = (prefix: '# ' | '• ') => {
    const el = bodyRef.current
    const at = el ? el.selectionEnd : body.length
    const lineEnd = body.indexOf('\n', at) < 0 ? body.length : body.indexOf('\n', at)
    const before = body.slice(0, lineEnd), after = body.slice(lineEnd)
    const lineNow = before.slice(before.lastIndexOf('\n') + 1)
    const lead = !before.trim() ? '' : lineNow.trim() === '' ? '' : prefix === '# ' ? '\n\n' : '\n'
    const next = before + lead + prefix + after
    setBody(next)
    caret(before.length + lead.length + prefix.length)
  }
  /** Enter on a bullet starts the next bullet; Enter on an empty bullet ends the list. */
  const bodyKeys = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return
    const el = e.currentTarget
    const at = el.selectionStart
    const line = body.slice(body.lastIndexOf('\n', at - 1) + 1, at)
    if (!line.startsWith('• ') && !line.startsWith('# ')) return
    e.preventDefault()
    if (line === '• ') { // empty bullet: drop it and leave the list
      const start = at - 2
      setBody(body.slice(0, start) + body.slice(at)); caret(start); return
    }
    const ins = '\n• '
    setBody(body.slice(0, at) + ins + body.slice(el.selectionEnd)); caret(at + ins.length)
  }
  const [decisions, setDecisions] = useState(note.decisions ?? '')
  // Someone else has this note open: show theirs as it changes, read-only, until they close it.
  const lockedBy = useLockedBy(note.id)
  const [shownAt, setShownAt] = useState(note.updated_at)
  if (lockedBy && note.updated_at !== shownAt) {
    setShownAt(note.updated_at)
    setTitle(note.title); setLocation(note.location ?? ''); setBody(note.body ?? ''); setDecisions(note.decisions ?? '')
  }
  const [newAction, setNewAction] = useState('')
  const [printing, setPrinting] = useState(false)
  const actions = note.actions ?? []
  const donePrinting = useCallback(() => setPrinting(false), [])
  const save = (c: Partial<MeetingNote>) => onPatch({ ...c, updated_at: new Date().toISOString() })
  const setActions = (a: ActionItem[]) => save({ actions: a })
  const close = () => {
    const c: Partial<MeetingNote> = {}
    if (title !== note.title) c.title = title
    if (location !== (note.location ?? '')) c.location = location || null
    if (body !== (note.body ?? '')) c.body = body || null
    if (decisions !== (note.decisions ?? '')) c.decisions = decisions || null
    if (Object.keys(c).length) save(c)
    onClose()
  }
  const addAction = () => {
    const text = newAction.trim()
    if (!text) return
    setActions([...actions, { id: crypto.randomUUID(), text, who: null, due: null, done: false }])
    setNewAction('')
  }
  const patchAction = (id: string, c: Partial<ActionItem>) => setActions(actions.map((a) => (a.id === id ? { ...a, ...c } : a)))
  // Milestones first (meetings usually are one), then other work, by date.
  const linkable = tasks.filter((t) => t.kind !== 'item')
    .sort((a, b) => Number(b.is_milestone) - Number(a.is_milestone) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const team = people.filter((p) => p.active || (note.attendee_ids ?? []).includes(p.id))
  const mt = typeOf(note.meeting_type)

  return (
    <Modal size="wide" onClose={close} lock={lockedBy ? undefined : note.id}
      title={
        <div className="note-head">
          <span className="note-kicker" style={mt ? { color: mt.color } : undefined}>{mt?.label ?? 'Meeting Notes'}</span>
          <input className="field note-title" disabled={Boolean(lockedBy)} value={title} placeholder="Meeting title, e.g. Owner SD review" autoFocus={!note.title}
            onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== note.title && save({ title })} />
        </div>
      }
      footer={
        <>
          <button className="btn danger" disabled={Boolean(lockedBy)} onClick={() => { if (window.confirm('Delete this meeting note?')) { onDelete(); onClose() } }}>Delete note</button>
          <span className="grow" />
          <span className="muted small">{note.author ? `Started by ${note.author}. ` : ''}Saved as you go.</span>
          <button className="btn" title="Opens the print dialog: choose Save as PDF" onClick={() => {
            // Save what's typed first, so the PDF has it.
            const c: Partial<MeetingNote> = {}
            if (title !== note.title) c.title = title
            if (location !== (note.location ?? '')) c.location = location || null
            if (body !== (note.body ?? '')) c.body = body || null
            if (decisions !== (note.decisions ?? '')) c.decisions = decisions || null
            if (Object.keys(c).length) save(c)
            setPrinting(true)
          }}>Export PDF</button>
          <button className="btn primary" onClick={close}>Done</button>
          {printing && (
            <NotePrint note={{ ...note, title, location: location || null, body: body || null, decisions: decisions || null }}
              project={project ?? null} people={people} tasks={tasks} onDone={donePrinting} />
          )}
        </>
      }>
      {lockedBy && <p className="lock-banner">{lockedBy} is editing this note. You can read along; it opens for editing when they close it.</p>}
      <fieldset className="plain-fieldset" disabled={Boolean(lockedBy)}>
      <div className="note-grid">
        <label>Type
          <select className="field boxed" value={note.meeting_type ?? ''} onChange={(e) => save({ meeting_type: e.target.value || null })}>
            <option value="">Choose…</option>
            {MEETING_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label>Date<input type="date" className="field boxed" value={note.meeting_date} onChange={(e) => e.target.value && save({ meeting_date: e.target.value })} /></label>
        <label>Where<input className="field boxed" value={location} placeholder="Office, Teams, site…" onChange={(e) => setLocation(e.target.value)}
          onBlur={() => location !== (note.location ?? '') && save({ location: location || null })} /></label>
        <label>For
          <select className="field boxed" value={note.task_id ?? ''} onChange={(e) => save({ task_id: e.target.value || null })}>
            <option value="">The project in general</option>
            {linkable.map((t) => <option key={t.id} value={t.id}>{t.is_milestone ? '◆ ' : ''}{t.title}{t.due_date ? ` (${formatDate(t.due_date)})` : ''}</option>)}
          </select>
        </label>
        <div className="note-att">
          <span className="note-label">Attendees</span>
          <AttendeePicker ids={note.attendee_ids ?? []} guests={splitGuests(note.attendees)} people={people}
            onChange={(ids, guests) => save({ attendee_ids: ids, attendees: guests.join(', ') || null })} />
        </div>
      </div>

      <div className="note-sections">
        <section className="note-sec notes">
          <div className="note-label-row">
            <span className="note-label">Notes</span>
            <span className="note-tools">
              <button type="button" className="btn ghost small-btn" title="Start a new topic (a heading)" onMouseDown={(e) => e.preventDefault()} onClick={() => insertLine('# ')}>+ Topic</button>
              <button type="button" className="btn ghost small-btn" title="Add a bullet point under the topic (Enter adds the next one)" onMouseDown={(e) => e.preventDefault()} onClick={() => insertLine('• ')}>+ Item discussed</button>
            </span>
          </div>
          <textarea ref={bodyRef} className="field boxed note-body" value={body} autoFocus={Boolean(note.title)}
            placeholder={'What was discussed…\n\nUse + Topic for a heading, then + Item discussed for bullet points under it.'}
            onChange={(e) => setBody(e.target.value)} onKeyDown={bodyKeys} onBlur={() => body !== (note.body ?? '') && save({ body: body || null })} />
        </section>
        <aside className="note-side">
          <section className="note-sec">
            <span className="note-label">Decisions</span>
            <textarea className="field boxed note-decisions" value={decisions} placeholder={'One per line, e.g.\nGo with option B for the lobby'}
              onChange={(e) => setDecisions(e.target.value)} onBlur={() => decisions !== (note.decisions ?? '') && save({ decisions: decisions || null })} />
          </section>
          <section className="note-sec">
            <span className="note-label">Action items <span className="muted">{actions.filter((a) => !a.done).length ? `· ${actions.filter((a) => !a.done).length} open` : ''}</span></span>
            <ul className="actions">
              {actions.map((a) => (
                <li key={a.id} className={a.done ? 'done' : ''}>
                  <input type="checkbox" checked={a.done} title="Done" onChange={(e) => patchAction(a.id, { done: e.target.checked })} />
                  <div className="act-body">
                    <input className="field act-text" defaultValue={a.text} onBlur={(e) => e.target.value.trim() && e.target.value !== a.text && patchAction(a.id, { text: e.target.value.trim() })} />
                    <div className="act-meta">
                      <select className="field act-who" value={a.who ?? ''} title="Who" onChange={(e) => patchAction(a.id, { who: e.target.value || null })}>
                        <option value="">Who?</option>
                        {team.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <input type="date" className="field act-due" value={a.due ?? ''} title="Due" onChange={(e) => patchAction(a.id, { due: e.target.value || null })} />
                      {onMakeTask && (a.task_id
                        ? <span className="act-task" title="This is a task in the project now">✓ Task</span>
                        : <button className="linkbtn small" title="Add it to the project as a task" onClick={async () => { const id = await onMakeTask(a); if (id) patchAction(a.id, { task_id: id }) }}>Make task</button>)}
                    </div>
                  </div>
                  <button className="icon-btn" title="Remove" onClick={() => setActions(actions.filter((x) => x.id !== a.id))}>×</button>
                </li>
              ))}
            </ul>
            <div className="act-add">
              <input className="field boxed" placeholder="Add an action item…" value={newAction} onChange={(e) => setNewAction(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAction() } }} />
              <button className="btn" disabled={!newAction.trim()} onClick={addAction}>Add</button>
            </div>
          </section>
        </aside>
      </div>
      </fieldset>
    </Modal>
  )
}
