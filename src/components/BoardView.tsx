import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { addDays, daysBetween, parseISO, shortDate, today } from '../lib/dates.ts'
import { TASK_STATUSES, type Person, type Phase, type Task, type TaskStatus } from '../lib/types.ts'
import { shiftDates } from '../lib/useProjectPlan.ts'
import { mondayOf, weekStarts } from '../lib/workload.ts'
import { assignPatch, assigneesOf, isAssigned } from '../lib/assignees.ts'
import { AvatarStack, MilestoneMark } from './TaskChips.tsx'
import { textOn } from '../lib/colors.ts'
import type { WorkGroup } from '../lib/tree.ts'

/** "Schematic Design" → "SD", "Construction Administration" → "CA", "Bidding" → "B". */
const initialsOfPhase = (name: string) => name.split(/[\s/&-]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase()

/**
 * Task board. Columns by status (kanban), by phase, by week (a post-it pull-plan) or by person (post-its; unassigned work on the left to hand out). Drag a card to another
 * column to change its status, phase, week or who's on it.
 */

export type BoardGroup = 'status' | 'phase' | 'week' | 'person'

const WEEK_COLS = 8

interface Column { key: string; title: string; sub?: string; accent?: string; droppable: boolean; tasks: Task[]; current?: boolean }

export default function BoardView({
  group, phases, tasks, people, palette, onPatch, onOpenTask, onAdd, team, teamBar, groupOf, onTeam,
}: {
  /** Update the project team: people who get or hand over work on the person board join it, so their column stays. */
  onTeam?: (team: string[]) => void
  /** The sheet a card belongs to (itself, or the sheet it sits under); null for a general task. */
  /** Which kind of work a card is (General / Sheets / Project Manual); left out when the board is filtered to one kind. */
  groupOf?: (t: Task) => WorkGroup
  /** The project team (person board columns); empty = everyone active on the Team list who has work here. */
  team?: string[]
  /** Shown above the person board: the project team with "+ Add team member". */
  teamBar?: ReactNode
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
  // After a drop: scroll to where the card landed and flash it, so you can see where it went.
  const [landed, setLanded] = useState<{ id: string; col: string; at: number } | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!landed) return
    const find = () => boardRef.current?.querySelector<HTMLElement>(`[data-card="${landed.id}"][data-col="${CSS.escape(landed.col)}"]`)
      ?? boardRef.current?.querySelector<HTMLElement>(`[data-card="${landed.id}"]`)
    // Wait a frame for the card to render in its new column.
    const raf = requestAnimationFrame(() => {
      const el = find()
      if (!el) return
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      el.classList.remove('landed'); void el.offsetWidth; el.classList.add('landed')
    })
    const done = setTimeout(() => setLanded(null), 1600)
    return () => { cancelAnimationFrame(raf); clearTimeout(done) }
  }, [landed])
  const [dragFrom, setDragFrom] = useState<string | null>(null) // column the card was picked up from (person board)
  const [from, setFrom] = useState(() => addDays(mondayOf(today()), -7))

  const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  const phaseIndex = new Map(sortedPhases.map((p, i) => [p.id, i]))
  const phaseColor = (i: number) => palette[i] ?? '#8b8f94'
  const staffOrder = [...people].sort((a, b) => a.name.localeCompare(b.name))
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
  } else if (group === 'person') {
    // Unassigned work first, to hand out; then each person (the project team, or everyone with work here).
    // The team always shows (even with nothing assigned), plus anyone else who has work here.
    const withWork = staffOrder.filter((p) => tasks.some((t) => isAssigned(t, p.id))).map((p) => p.id)
    // In name order, so columns don't jump around when someone joins the team.
    const all = new Set([...(team ?? []), ...withWork])
    const ids = staffOrder.filter((p) => all.has(p.id)).map((p) => p.id)
    const open = (t: Task) => t.status !== 'done'
    columns = [
      { key: 'unassigned', title: 'Unassigned', sub: 'Drag to someone', droppable: true, tasks: tasks.filter((t) => !assigneesOf(t).length && open(t)).sort(byDue) },
      ...ids.map((id) => person(id)).filter((p): p is Person => Boolean(p)).map((p) => ({
        key: p.id, title: p.name, sub: p.kind === 'consultant' ? p.company ?? 'Consultant' : p.role ?? undefined, droppable: true,
        tasks: tasks.filter((t) => isAssigned(t, p.id)).sort(byDue),
      })),
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

  /** The column whose left–right span is under the pointer (for drops below or between the cards). */
  function colAt(e: DragEvent): Column | undefined {
    const els = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(':scope > .board-col')]
    const i = els.findIndex((el) => { const r = el.getBoundingClientRect(); return e.clientX >= r.left - 6 && e.clientX <= r.right + 6 })
    return i >= 0 ? columns[i] : undefined
  }

  function drop(col: Column, e: DragEvent) {
    e.preventDefault()
    setOver(null)
    const t = tasks.find((x) => x.id === (e.dataTransfer.getData('text/plain') || dragId))
    setDragId(null)
    if (!t || !col.droppable) return
    setLanded({ id: t.id, col: col.key, at: Date.now() })
    if (group === 'person') {
      const ids = assigneesOf(t)
      const fromId = dragFrom
      setDragFrom(null)
      // Everyone involved joins the project team, so emptying someone's column never takes them off the board.
      const keep = [fromId, col.key, ...ids].filter((x): x is string => Boolean(x) && x !== 'unassigned' && Boolean(person(x!)))
      const cur = team ?? []
      if (onTeam && keep.some((x) => !cur.includes(x))) onTeam([...cur, ...keep.filter((x, i) => !cur.includes(x) && keep.indexOf(x) === i)])
      if (col.key === 'unassigned') { if (ids.length) onPatch(t, assignPatch([])); return }
      if (ids.includes(col.key)) return
      // Moving from one person to another hands it over; from Unassigned it just gets this person.
      const rest = fromId && fromId !== 'unassigned' ? ids.filter((x) => x !== fromId) : ids
      onPatch(t, assignPatch([...rest, col.key]))
      return
    }
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
    if (group === 'person') return col.key === 'unassigned' ? assignPatch([]) : assignPatch([col.key])
    if (group === 'status') return { status: col.key as TaskStatus }
    if (group === 'phase') return { phase_id: col.key || null }
    if (col.key === 'nodate') return { start_date: null, due_date: null }
    if (!col.droppable) return null
    return { start_date: col.key, due_date: addDays(col.key, 4) }
  }

  return (
    <div className={`board board-${group}`} ref={boardRef}>
      {group === 'person' && teamBar && <div className="board-bar">{teamBar}</div>}
      {group === 'week' && (
        <div className="board-bar">
          <div className="toolbar">
            <button className="btn" onClick={() => setFrom(addDays(from, -28))}>‹ Earlier</button>
            <button className="btn" onClick={() => setFrom(addDays(thisWeek, -7))}>This week</button>
            <button className="btn" onClick={() => setFrom(addDays(from, 28))}>Later ›</button>
          </div>
        </div>
      )}
      {/* The whole height under each column takes drops too: whichever column the pointer is over (left to right). */}
      <div className="board-cols"
        onDragOver={(e) => { const col = colAt(e); if (col?.droppable) { e.preventDefault(); if (over !== col.key) setOver(col.key) } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }}
        onDrop={(e) => { const col = colAt(e); if (col) drop(col, e); else setOver(null) }}>
        {columns.map((col) => {
          const defaults = addDefaults(col)
          const openCount = col.tasks.filter((t) => t.status !== 'done').length
          return (
            <div key={col.key || 'none'}
              className={`board-col${over === col.key && col.droppable ? ' over' : ''}${col.current ? ' current' : ''}${col.droppable ? '' : ' fixed'}`}
              onDragOver={(e) => { if (col.droppable) { e.preventDefault(); setOver(col.key) } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }}
              onDrop={(e) => { e.stopPropagation(); drop(col, e) }}>
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
                {(() => {
                  const card = (t: Task, i: number) => {
                  const crew = assigneesOf(t).map((id) => person(id)).filter((x): x is Person => Boolean(x))
                  const pi = t.phase_id ? phaseIndex.get(t.phase_id) : undefined
                  const note = true // every board uses the same card: the post-it look on the theme's card colour
                  return (
                    <div key={t.id} draggable data-card={t.id} data-col={col.key}
                      className={`card-task${t.status === 'done' ? ' done' : ''}${dragId === t.id ? ' dragging' : ''}${note ? ' note' : ''}${landed?.id === t.id && landed.col === col.key ? ' landed' : ''}`}
                      style={note
                        ? { transform: `rotate(${i % 2 ? 0.6 : -0.6}deg)` }
                        : undefined}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; setDragId(t.id); setDragFrom(col.key) }}
                      onDragEnd={() => { setDragId(null); setOver(null) }}
                      onClick={() => onOpenTask(t)}>
                      {note && (() => {
                        // Post-its: a strip down the left in the phase's colour, with the phase's initials.
                        const ph = t.phase_id ? sortedPhases[phaseIndex.get(t.phase_id) ?? -1] : undefined
                        const c = pi === undefined ? '#c9c6bf' : phaseColor(pi)
                        return (
                          <span className="ct-phase" style={{ background: c, color: textOn(c) }} title={ph ? ph.name : 'No phase'}>
                            {ph ? initialsOfPhase(ph.name) : '–'}
                          </span>
                        )
                      })()}
                      <div className="ct-title">
                        {t.is_milestone && <MilestoneMark task={t} />}
                        {(t.kind === 'sheet' || t.kind === 'section') && t.sheet_number && <span className="mono ct-no">{t.sheet_number}</span>}
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
                }
                  // Cards gather in two zones on the column itself, general tasks then sheet work, and within a zone
                  // they clump by phase (a small phase label over each clump; not needed when columns are phases).
                  const byPhase = (list: Task[]) => {
                    const order = (t: Task) => (t.phase_id ? phaseIndex.get(t.phase_id) ?? 999 : 999)
                    return [...list].sort((x, y) => order(x) - order(y))
                  }
                  const zone = (kind: 'general' | 'sheet' | 'manual', label: string, list: Task[]) => {
                    if (!list.length) return null
                    const out: ReactNode[] = []
                    let last: string | null | undefined
                    byPhase(list).forEach((t, i) => {
                      const ph = t.phase_id ?? null
                      if (group !== 'phase' && ph !== last) {
                        const pi2 = ph ? phaseIndex.get(ph) : undefined
                        out.push(
                          <div key={`ph-${ph ?? 'none'}`} className="nz-phase">
                            <i style={{ background: pi2 === undefined ? '#c9c6bf' : phaseColor(pi2) }} />{pi2 === undefined ? 'No phase' : sortedPhases[pi2].name}
                          </div>,
                        )
                        last = ph
                      }
                      out.push(card(t, i))
                    })
                    // Filtered to one kind (no groupOf): no zone box, just the phase clumps.
                    if (!groupOf) return <div className="nz-cards plain">{out}</div>
                    return <div className={`note-zone ${kind}`}><span className="nz-label">{label}</span><div className="nz-cards">{out}</div></div>
                  }
                  if (!groupOf) return zone('general', '', col.tasks)
                  return (
                    <>
                      {zone('general', 'General', col.tasks.filter((t) => groupOf(t) === 'tasks'))}
                      {zone('sheet', 'Sheets', col.tasks.filter((t) => groupOf(t) === 'sheets'))}
                      {zone('manual', 'Project Manual', col.tasks.filter((t) => groupOf(t) === 'manual'))}
                    </>
                  )
                })()}
                {defaults && <button className="board-add" onClick={() => onAdd(defaults)}>+ Add task</button>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
