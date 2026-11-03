import { useEffect, useRef, useState } from 'react'
import { addDays, daysBetween, parseISO, toISO, today } from '../lib/dates.ts'
import type { Person, Phase, Task } from '../lib/types.ts'

/**
 * Month calendar. Tasks show as bars across the days they run, milestones on their date,
 * phases as a thin band along the top. Drag a task to another day to move it.
 */

interface Item { kind: 'phase' | 'task'; id: string; title: string; start: string; end: string; color: string; task?: Task; done: boolean; milestone: boolean }
interface Placed extends Item { col: number; span: number; lane: number; clippedL: boolean; clippedR: boolean }

function monthStart(iso: string) { return iso.slice(0, 8) + '01' }

export default function CalendarView({
  phases, tasks, people, palette, onShiftTask, onOpenTask,
}: {
  phases: Phase[]
  tasks: Task[]
  people: Person[]
  /** Phase colours, in phase order. */
  palette: string[]
  onShiftTask: (task: Task, days: number) => void
  onOpenTask: (task: Task) => void
}) {
  const [month, setMonth] = useState(() => monthStart(today()))
  const [drag, setDrag] = useState<{ id: string; grab: string; over: string; moved: boolean } | null>(null)
  const dragRef = useRef(drag)
  useEffect(() => { dragRef.current = drag }, [drag])

  const m = parseISO(month)
  const gridStart = addDays(month, -m.getUTCDay()) // Sunday on or before the 1st
  const monthEnd = toISO(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)))
  const weekCount = Math.ceil((daysBetween(gridStart, monthEnd) + 1) / 7)
  const weeks = Array.from({ length: weekCount }, (_, i) => addDays(gridStart, i * 7))
  const t = today()

  const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  const colorOfPhase = new Map(sortedPhases.map((p, i) => [p.id, palette[i]]))
  const initials = (id: string | null) => {
    const p = people.find((x) => x.id === id)
    return p ? p.initials ?? p.name.slice(0, 2) : ''
  }

  const delta = drag?.moved ? daysBetween(drag.grab, drag.over) : 0
  const items: Item[] = [
    ...sortedPhases.map((p) => ({ kind: 'phase' as const, id: p.id, title: p.name, start: p.start_date, end: p.end_date, color: colorOfPhase.get(p.id)!, done: false, milestone: false })),
    ...tasks.flatMap((task) => {
      const s = task.start_date ?? task.due_date, e = task.due_date ?? task.start_date
      if (!s || !e) return []
      const d = drag?.id === task.id ? delta : 0
      return [{
        kind: 'task' as const, id: task.id, title: task.title, start: addDays(s, d), end: addDays(e, d),
        color: colorOfPhase.get(task.phase_id ?? '') ?? '#8b8f94', task, done: task.status === 'done', milestone: task.is_milestone,
      }]
    }),
  ]

  const placeWeek = (ws: string): Placed[] => {
    const we = addDays(ws, 6)
    const inWeek = items
      .filter((it) => it.start <= we && it.end >= ws)
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'phase' ? -1 : 1) || a.start.localeCompare(b.start) || b.end.localeCompare(a.end))
    const lanes: number[][] = [] // per lane, occupied columns
    return inWeek.map((it) => {
      const s = it.start < ws ? ws : it.start
      const e = it.end > we ? we : it.end
      const col = daysBetween(ws, s), span = daysBetween(s, e) + 1
      let lane = 0
      while (lanes[lane]?.some((c) => c >= col && c < col + span)) lane++
      lanes[lane] = [...(lanes[lane] ?? []), ...Array.from({ length: span }, (_, k) => col + k)]
      return { ...it, col, span, lane, clippedL: it.start < ws, clippedR: it.end > we }
    })
  }

  // Which day is under the pointer: the week row under it, and the column by x position.
  const dayAt = (x: number, y: number): string | null => {
    for (const el of document.elementsFromPoint(x, y)) {
      const wk = (el as HTMLElement).dataset?.week
      if (wk) {
        const r = el.getBoundingClientRect()
        const col = Math.max(0, Math.min(6, Math.floor(((x - r.left) / r.width) * 7)))
        return addDays(wk, col)
      }
    }
    return null
  }

  useEffect(() => {
    if (!drag) return
    const move = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const over = dayAt(e.clientX, e.clientY) ?? d.over
      if (over !== d.over || (!d.moved && over !== d.grab)) {
        const next = { ...d, over, moved: d.moved || over !== d.grab }
        dragRef.current = next // keep the latest for pointerup, even before React re-renders
        setDrag(next)
      }
    }
    const up = () => {
      const d = dragRef.current
      setDrag(null)
      if (!d) return
      const task = tasks.find((x) => x.id === d.id)
      if (!task) return
      if (!d.moved) onOpenTask(task)
      else if (d.over !== d.grab) onShiftTask(task, daysBetween(d.grab, d.over))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [drag?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- listeners read the latest drag from dragRef

  const monthLabel = m.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const shiftMonth = (n: number) => setMonth(toISO(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1))))

  return (
    <div className="calendar">
      <div className="cal-head">
        <h2>{monthLabel}</h2>
        <div className="toolbar">
          <button className="btn" onClick={() => shiftMonth(-1)}>‹</button>
          <button className="btn" onClick={() => setMonth(monthStart(today()))} disabled={month === monthStart(t)}>Today</button>
          <button className="btn" onClick={() => shiftMonth(1)}>›</button>
        </div>
      </div>
      <div className="cal-dow">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className={`cal-grid${drag?.moved ? ' dragging' : ''}`}>
        {weeks.map((ws) => {
          const placed = placeWeek(ws)
          return (
            <div key={ws} className="cal-week" data-week={ws}>
              <div className="cal-days">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(ws, i)
                  const cls = [d.slice(0, 7) !== month.slice(0, 7) ? 'other' : '', d === t ? 'today' : '', i === 0 || i === 6 ? 'weekend' : ''].join(' ')
                  return <div key={d} className={`cal-day ${cls}`}><span>{parseISO(d).getUTCDate()}</span></div>
                })}
              </div>
              <div className="cal-items">
                {placed.map((p) => p.kind === 'phase' ? (
                  <div key={p.id} className="cal-phase" style={{ gridColumn: `${p.col + 1} / span ${p.span}`, gridRow: p.lane + 1, background: p.color }}>
                    {(!p.clippedL || p.col === 0) && <span>{p.title}</span>}
                  </div>
                ) : (
                  <button key={p.id}
                    className={`cal-task${p.milestone ? ' milestone' : ''}${p.done ? ' done' : ''}${drag?.id === p.id && drag.moved ? ' lifted' : ''}${p.clippedL ? ' cl' : ''}${p.clippedR ? ' cr' : ''}`}
                    style={{ gridColumn: `${p.col + 1} / span ${p.span}`, gridRow: p.lane + 1, ['--c' as string]: p.color }}
                    title={p.title}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      e.preventDefault()
                      const grab = dayAt(e.clientX, e.clientY)
                      if (grab) { const d = { id: p.id, grab, over: grab, moved: false }; dragRef.current = d; setDrag(d) }
                    }}>
                    {p.milestone && <span className="diamond" />}
                    <span className="cal-title">{p.title}</span>
                    {!p.milestone && p.task?.assignee_id && <span className="cal-who">{initials(p.task.assignee_id)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="muted small">Drag a task to another day to move it (its length stays the same). Click a task to edit it.</p>
    </div>
  )
}
