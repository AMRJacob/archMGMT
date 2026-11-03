import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { shortDate, today } from '../lib/dates.ts'
import { assigneesOf, assignPatch, initialsOf } from '../lib/assignees.ts'
import { MILESTONE_TYPES, milestoneType } from '../lib/milestones.ts'
import { EFFORTS, TASK_STATUSES, type Person, type Phase, type Task, type TaskStatus } from '../lib/types.ts'

/**
 * Click-to-change controls for a task: each piece of a row opens a small menu right where it is.
 * Used in Overview rows and in the quick panel that opens from the timeline, calendar and board.
 */

/** A button that opens a small floating menu under itself. */
export function Pop({ label, title, className = '', children, align = 'left' }: {
  label: ReactNode
  title?: string
  className?: string
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [flip, setFlip] = useState(false)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc, true)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc, true) }
  }, [open])

  // Open upward when there isn't room below.
  useLayoutEffect(() => {
    if (!open || !menu.current) return
    const r = menu.current.getBoundingClientRect()
    if (r.bottom > window.innerHeight - 8) setFlip(true)
  }, [open])

  return (
    <span className={`pop ${className}`} ref={box} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={`chip-btn${open ? ' open' : ''}`} title={title} onClick={() => { setFlip(false); setOpen(!open) }}>{label}</button>
      {open && (
        <div ref={menu} className={`pop-menu ${align}${flip ? ' up' : ''}`} role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  )
}

const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Done' }

export function StatusChip({ task, onPatch }: { task: Task; onPatch: (c: Partial<Task>) => void }) {
  return (
    <Pop className="status-pop" title="Status" label={<span className={`st ${task.status}`}>{STATUS_LABEL[task.status]}</span>}>
      {(close) => TASK_STATUSES.map((s) => (
        <button key={s.value} className={`pm-item${task.status === s.value ? ' on' : ''}`} onClick={() => { onPatch({ status: s.value }); close() }}>
          <span className={`st ${s.value}`}>{s.label}</span>
        </button>
      ))}
    </Pop>
  )
}

export function SizeChip({ task, onPatch }: { task: Task; onPatch: (c: Partial<Task>) => void }) {
  if (task.is_milestone) return <span className="chip-spacer" />
  const e = task.effort ?? 2
  return (
    <Pop title={`Size: ${EFFORTS[e - 1].label}`} label={<span className={`effort e${e}`}><i /><i /><i /></span>}>
      {(close) => EFFORTS.map((x) => (
        <button key={x.value} className={`pm-item${e === x.value ? ' on' : ''}`} onClick={() => { onPatch({ effort: x.value }); close() }}>
          <span className={`effort e${x.value}`}><i /><i /><i /></span>
          <span><strong>{x.label}</strong><span className="pm-hint">{x.hint}</span></span>
        </button>
      ))}
    </Pop>
  )
}

export function DateChip({ task, onPatch, locked = false }: { task: Task; onPatch: (c: Partial<Task>) => void; locked?: boolean }) {
  const late = task.due_date && task.due_date < today() && task.status !== 'done'
  const text = task.is_milestone
    ? (task.due_date ? shortDate(task.due_date) : 'Set date')
    : task.start_date && task.due_date ? `${shortDate(task.start_date)} – ${shortDate(task.due_date)}`
      : task.due_date ? `Due ${shortDate(task.due_date)}` : 'Set dates'
  if (locked) {
    return <span className="chip-btn static" title="Dates come from the views and tasks under it"><span className="date-chip rolled">{text}</span></span>
  }
  return (
    <Pop title="Dates" align="right" label={<span className={`date-chip${late ? ' late' : ''}${task.due_date ? '' : ' empty'}`}>{text}</span>}>
      {() => (
        <div className="pm-dates">
          {!task.is_milestone && (
            <label>Start<input type="date" className="field" value={task.start_date ?? ''}
              onChange={(e) => onPatch({ start_date: e.target.value || null })} /></label>
          )}
          <label>{task.is_milestone ? 'Date' : 'Due'}<input type="date" className="field" value={task.due_date ?? ''}
            onChange={(e) => onPatch({ due_date: e.target.value || null })} /></label>
        </div>
      )}
    </Pop>
  )
}

/** Overlapping avatars for everyone on a task (up to three, then "+n"). */
export function AvatarStack({ people, max = 3 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max)
  return (
    <span className="avatar-stack" title={people.map((p) => p.name).join(', ')}>
      {shown.map((p) => <span key={p.id} className="avatar sm">{initialsOf(p)}</span>)}
      {people.length > max && <span className="avatar sm more">+{people.length - max}</span>}
    </span>
  )
}

/** Who's on it: tick as many people as you like; the first ticked is the lead. */
export function AssigneeChip({ task, people, onPatch }: { task: Task; people: Person[]; onPatch: (c: Partial<Task>) => void }) {
  const ids = assigneesOf(task)
  const crew = ids.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => Boolean(p))
  const active = people.filter((p) => p.active || ids.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name))
  const group = (kind: Person['kind']) => active.filter((p) => p.kind === kind)
  const toggle = (id: string) => onPatch(assignPatch(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  return (
    <Pop title={crew.length ? `Assigned to ${crew.map((p) => p.name).join(', ')}` : 'Assign'} align="right"
      label={crew.length ? <AvatarStack people={crew} /> : <span className="avatar sm empty">+</span>}>
      {(close) => (
        <div className="pm-people">
          {(['staff', 'consultant'] as const).map((k) => group(k).length > 0 && (
            <div key={k}>
              <div className="pm-label">{k === 'staff' ? 'Staff' : 'Consultants'}</div>
              {group(k).map((p) => {
                const on = ids.includes(p.id)
                return (
                  <button key={p.id} className={`pm-item pick${on ? ' on' : ''}`} onClick={() => toggle(p.id)} aria-pressed={on}>
                    <span className="pick-box" aria-hidden="true">{on ? '✓' : ''}</span>
                    <span className="avatar sm">{initialsOf(p)}</span>
                    <span>{p.name}{ids[0] === p.id && ids.length > 1 ? <span className="pm-hint">lead</span> : p.company ? <span className="pm-hint">{p.company}</span> : null}</span>
                  </button>
                )
              })}
            </div>
          ))}
          <div className="pm-sep" />
          <div className="pm-row">
            {ids.length > 0 && <button className="pm-item muted" onClick={() => { onPatch(assignPatch([])); close() }}>Clear</button>}
            <button className="pm-item" onClick={close}>Done</button>
          </div>
        </div>
      )}
    </Pop>
  )
}

export function MoreMenu({ task, phases, onPatch, onDelete }: {
  task: Task; phases: Phase[]; onPatch: (c: Partial<Task>) => void; onDelete: () => void
}) {
  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  return (
    <Pop title="More" align="right" className="more-pop" label={<span className="more-dots">⋯</span>}>
      {(close) => (
        <>
          <label className="pm-item check">
            <input type="checkbox" checked={task.is_milestone}
              onChange={(e) => onPatch(e.target.checked ? { is_milestone: true, start_date: null } : { is_milestone: false, start_date: task.due_date })} />
            Milestone (a single date)
          </label>
          <div className="pm-sep" />
          <div className="pm-label">Phase</div>
          {sorted.map((p) => (
            <button key={p.id} className={`pm-item${task.phase_id === p.id ? ' on' : ''}`} onClick={() => { onPatch({ phase_id: p.id }); close() }}>{p.name}</button>
          ))}
          <div className="pm-sep" />
          <button className="pm-item danger" onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) { onDelete(); close() } }}>Delete task</button>
        </>
      )}
    </Pop>
  )
}

/** A milestone's diamond, coloured by its type. With onPatch it opens a menu to pick the type. */
export function MilestoneMark({ task, onPatch }: { task: Task; onPatch?: (c: Partial<Task>) => void }) {
  const mt = milestoneType(task.milestone_type)
  const mark = <span className="diamond" style={mt ? { background: mt.color } : undefined} title={mt ? `${mt.label} milestone` : 'Milestone'} />
  if (!onPatch) return mark
  return (
    <Pop className="ms-pop" title={mt ? `${mt.label} milestone: change type` : 'Milestone: set a type'} label={mark}>
      {(close) => (
        <>
          <div className="pm-label">Milestone type</div>
          {MILESTONE_TYPES.map((m) => (
            <button key={m.value} className={`pm-item${task.milestone_type === m.value ? ' on' : ''}`} onClick={() => { onPatch({ milestone_type: m.value }); close() }}>
              <span className="diamond" style={{ background: m.color }} />
              <span>{m.label}<span className="pm-hint">{m.hint}</span></span>
            </button>
          ))}
          {mt && <><div className="pm-sep" /><button className="pm-item muted" onClick={() => { onPatch({ milestone_type: null }); close() }}>No type</button></>}
        </>
      )}
    </Pop>
  )
}

/** The full set of chips for one task, in reading order. */
export function TaskControls({ task, people, phases, onPatch, onDelete, isParent = false }: {
  task: Task; people: Person[]; phases: Phase[]; onPatch: (c: Partial<Task>) => void; onDelete: () => void
  /** Has scheduled work under it: dates roll up and its size doesn't count. */
  isParent?: boolean
}) {
  return (
    <span className="task-controls">
      <StatusChip task={task} onPatch={onPatch} />
      {isParent ? <span className="chip-spacer" /> : <SizeChip task={task} onPatch={onPatch} />}
      <DateChip task={task} onPatch={onPatch} locked={isParent} />
      <AssigneeChip task={task} people={people} onPatch={onPatch} />
      <MoreMenu task={task} phases={phases} onPatch={onPatch} onDelete={onDelete} />
    </span>
  )
}
