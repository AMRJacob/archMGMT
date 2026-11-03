import { useState, type DragEvent } from 'react'
import { addDays, daysBetween, parseISO, shortDate, today } from '../lib/dates.ts'
import { TASK_STATUSES, type Person, type Phase, type Task, type TaskStatus } from '../lib/types.ts'
import { shiftDates } from '../lib/useProjectPlan.ts'
import { mondayOf, weekStarts } from '../lib/workload.ts'
import { assigneesOf, isAssigned } from '../lib/assignees.ts'
import { AvatarStack, MilestoneMark } from './TaskChips.tsx'

/**
 * Task board. Columns by status (kanban), by phase, or by week (a post-it pull-plan, cards
 * coloured by person). Drag a card to another column to change its status, phase or week.
 */

export type BoardGroup = 'status' | 'phase' | 'week'

const NOTE_COLORS = ['#fdf1b8', '#d7ecf7', '#f9d9cf', '#dcefd8', '#e9dcf4', '#fbe3bd', '#d5e7e3', '#f3d6e4', '#e2e4e8']
const WEEK_COLS = 8

interface Column { key: string; title: string; sub?: string; accent?: string; droppable: boolean; tasks: Task[]; current?: boolean }

export default function BoardView({
  group, phases, tasks, people, palette, onPatch, onOpenTask, onAdd,
}: {
  group: BoardGroup
  phases: Phase[]
  tasks: Task[]
  people: Person[]
  /** Phase colours, in phase order. */
  palette: string[]
  onPatch: (task: Task, changes: Partial<Task>) => void
  onOpenTask: (task: Task) => void
  onAdd: (defaults: Partial<Task>) => void
}) {
  const [over, setOver] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [from, setFrom] = useState(() => addDays(mondayOf(today()), -7))

  const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  const phaseIndex = new Map(sortedPhases.map((p, i) => [p.id, i]))
  const phaseColor = (i: number) => palette[i] ?? '#8b8f94'
  const staffOrder = [...people].sort((a, b) => a.name.localeCompare(b.name))
  const personColor = (id: string | null) => {
    const i = staffOrder.findIndex((p) => p.id === id)
    return i < 0 ? '#f1f0ec' : NOTE_COLORS[i % NOTE_COLORS.length]
  }
  const person = (id: string | null) => people.find((p) => p.id === id)
  const byDue = (a: Task, b: Task) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.title.localeCompare(b.title)
  const thisWeek = mondayOf(today())

  let columns: Column[]
  if (group === 'status') {
    columns = TASK_STATUSES.map((s) => ({ key: s.value, title: s.label, droppable: true, tasks: tasks.filter((t) => t.status === s.value).sort(byDue) }))
  } else if (group === 'phase') {
    columns = [
      ...sortedPhases.map((p, i) => ({
        key: p.id, title: p.name, sub: `${shortDate(p.start_date)} – ${shortDate(p.end_date)}`, accent: phaseColor(i), droppable: true,
        tasks: tasks.filter((t) => t.phase_id === p.id).sort(byDue), current: p.start_date <= today() && today() <= p.end_date,
      })),
      { key: '', title: 'No phase', droppable: true, tasks: tasks.filter((t) => !t.phase_id || !phaseIndex.has(t.phase_id)).sort(byDue) },
    ]
  } else {
    const weeks = weekStarts(from, WEEK_COLS)
    const last = addDays(weeks[weeks.length - 1], 6)
    const due = (t: Task) => t.due_date ?? t.start_date
    columns = [
      { key: 'earlier', title: 'Earlier', droppable: false, tasks: tasks.filter((t) => { const d = due(t); return d && d < from && t.status !== 'done' }).sort(byDue) },
      ...weeks.map((w) => ({
        key: w, title: `Week of ${shortDate(w)}`, sub: w === thisWeek ? 'This week' : undefined, droppable: true, current: w === thisWeek,
        tasks: tasks.filter((t) => { const d = due(t); return d && mondayOf(d) === w }).sort(byDue),
      })),
      { key: 'later', title: 'Later', droppable: false, tasks: tasks.filter((t) => { const d = due(t); return d && d > last }).sort(byDue) },
      { key: 'nodate', title: 'No date', droppable: true, tasks: tasks.filter((t) => !due(t)).sort(byDue) },
    ]
  }

  function drop(col: Column, e: DragEvent) {
    e.preventDefault()
    setOver(null)
    const t = tasks.find((x) => x.id === (e.dataTransfer.getData('text/plain') || dragId))
    setDragId(null)
    if (!t || !col.droppable) return
    if (group === 'status') {
      if (t.status !== col.key) onPatch(t, { status: col.key as TaskStatus })
    } else if (group === 'phase') {
      const next = col.key || null
      if (t.phase_id !== next) onPatch(t, { phase_id: next })
    } else if (col.key === 'nodate') {
      if (t.start_date || t.due_date) onPatch(t, { start_date: null, due_date: null })
    } else {
      const d = t.due_date ?? t.start_date
      if (!d) { onPatch(t, { due_date: addDays(col.key, 4) }); return } // Friday of that week
      const target = addDays(col.key, daysBetween(mondayOf(d), d)) // same weekday in the new week
      const delta = daysBetween(d, target)
      if (delta) onPatch(t, shiftDates(t, delta))
    }
  }

  const addDefaults = (col: Column): Partial<Task> | null => {
    if (group === 'status') return { status: col.key as TaskStatus }
    if (group === 'phase') return { phase_id: col.key || null }
    if (col.key === 'nodate') return { start_date: null, due_date: null }
    if (!col.droppable) return null
    return { start_date: col.key, due_date: addDays(col.key, 4) }
  }

  return (
    <div className={`board board-${group}`}>
      {group === 'week' && (
        <div className="board-bar">
          <div className="toolbar">
            <button className="btn" onClick={() => setFrom(addDays(from, -28))}>‹ Earlier</button>
            <button className="btn" onClick={() => setFrom(addDays(thisWeek, -7))}>This week</button>
            <button className="btn" onClick={() => setFrom(addDays(from, 28))}>Later ›</button>
          </div>
          <div className="note-legend">
            {staffOrder.filter((p) => p.active && tasks.some((t) => isAssigned(t, p.id))).map((p) => (
              <span key={p.id}><i style={{ background: personColor(p.id) }} />{p.name}</span>
            ))}
          </div>
        </div>
      )}
      <div className="board-cols">
        {columns.map((col) => {
          const defaults = addDefaults(col)
          const openCount = col.tasks.filter((t) => t.status !== 'done').length
          return (
            <div key={col.key || 'none'}
              className={`board-col${over === col.key && col.droppable ? ' over' : ''}${col.current ? ' current' : ''}${col.droppable ? '' : ' fixed'}`}
              onDragOver={(e) => { if (col.droppable) { e.preventDefault(); setOver(col.key) } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }}
              onDrop={(e) => drop(col, e)}>
              <div className="board-col-head" style={col.accent ? { borderTopColor: col.accent } : undefined}>
                <div>
                  <span className="strong">{col.title}</span>
                  <span className="count">{col.tasks.length}</span>
                </div>
                {(col.sub || (group !== 'status' && openCount > 0)) && (
                  <div className="muted small">{[col.sub, group !== 'status' && openCount > 0 ? `${openCount} open` : ''].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <div className="board-cards">
                {col.tasks.map((t, i) => {
                  const crew = assigneesOf(t).map((id) => person(id)).filter((x): x is Person => Boolean(x))
                  const pi = t.phase_id ? phaseIndex.get(t.phase_id) : undefined
                  const note = group === 'week'
                  return (
                    <div key={t.id} draggable
                      className={`card-task${t.status === 'done' ? ' done' : ''}${dragId === t.id ? ' dragging' : ''}${note ? ' note' : ''}`}
                      style={note
                        ? { background: personColor(t.assignee_id), transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }
                        : { borderLeftColor: pi === undefined ? '#c9c6bf' : phaseColor(pi) }}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id) }}
                      onDragEnd={() => { setDragId(null); setOver(null) }}
                      onClick={() => onOpenTask(t)}>
                      <div className="ct-title">
                        {t.is_milestone && <MilestoneMark task={t} />}
                        {t.kind === 'sheet' && t.sheet_number && <span className="mono ct-no">{t.sheet_number}</span>}
                        {t.kind === 'view' && <span className="kind-tag">View</span>}
                        {t.title}
                      </div>
                      <div className="ct-meta">
                        {crew.length > 0 && <AvatarStack people={crew} />}
                        {t.due_date && (
                          <span className={t.due_date < today() && t.status !== 'done' ? 'late' : ''}>
                            {t.is_milestone ? '' : 'Due '}{parseISO(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                          </span>
                        )}
                        {!t.is_milestone && <span className={`effort e${t.effort ?? 2}`} title={['Light', 'Medium', 'Heavy'][(t.effort ?? 2) - 1]}><i /><i /><i /></span>}
                        {group !== 'status' && <span className={`st ${t.status}`}>{TASK_STATUSES.find((s) => s.value === t.status)?.label}</span>}
                      </div>
                    </div>
                  )
                })}
                {defaults && <button className="board-add" onClick={() => onAdd(defaults)}>+ Add task</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
