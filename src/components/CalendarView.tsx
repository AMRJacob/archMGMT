import { useEffect, useRef, useState } from 'react'
import { addDays, daysBetween, parseISO, toISO, today } from '../lib/dates.ts'
import type { Person, Phase, Task } from '../lib/types.ts'
import { whoLabel } from '../lib/assignees.ts'
import { MilestoneMark } from './TaskChips.tsx'
import { milestoneColor } from '../lib/milestones.ts'

/**
 * Month calendar. Tasks show as bars across the days they run, milestones on their date,
 * phases as a thin band along the top. Drag a task to another day to move it.
 */

interface Item { kind: 'phase' | 'task'; id: string; title: string; start: string; end: string; color: string; task?: Task; done: boolean; milestone: boolean }
interface Placed extends Item { col: number; span: number; lane: number; clippedL: boolean; clippedR: boolean }

function monthStart(iso: string) { return iso.slice(0, 8) + '01' }

type CalScale = 'week' | 'month' | 'year'
const SCALE_KEY = 'archmgmt:calendar-scale'
function savedScale(): CalScale {
  try { const v = localStorage.getItem(SCALE_KEY); if (v === 'week' || v === 'month' || v === 'year') return v } catch { /* storage unavailable */ }
  return 'month'
}

/**
 * The whole project as small months, from the month it starts to the month it ends, with a heading where
 * a new year begins. Each week shows the phases running through it as thin bars; past days are dimmed;
 * milestones (◆) and due dates (•) are marked.
 */
function YearView({ items, today: t, onPickMonth, onPickDay }: {
  items: Item[]
  today: string
  onPickMonth: (iso: string) => void
  onPickDay: (iso: string) => void
}) {
  const dates = items.flatMap((it) => [it.start, it.end]).sort()
  if (!dates.length) return <p className="muted empty">Nothing scheduled yet.</p>
  const first = parseISO(dates[0]), last = parseISO(dates[dates.length - 1])
  const months: string[] = []
  for (let y = first.getUTCFullYear(), m = first.getUTCMonth(); y < last.getUTCFullYear() || (y === last.getUTCFullYear() && m <= last.getUTCMonth()); m++) {
    if (m > 11) { m = 0; y++ }
    months.push(toISO(new Date(Date.UTC(y, m, 1))))
    if (months.length > 72) break // six years is plenty
  }
  const phases = items.filter((it) => it.kind === 'phase')
  const dueOn = (d: string) => items.filter((it) => it.kind === 'task' && it.end === d)
  const years = [...new Set(months.map((m) => m.slice(0, 4)))]

  const monthCard = (mFirst: string) => {
    const mi = parseISO(mFirst).getUTCMonth(), yr = parseISO(mFirst).getUTCFullYear()
    const days = new Date(Date.UTC(yr, mi + 1, 0)).getUTCDate()
    const mLast = addDays(mFirst, days - 1)
    const gridStart = addDays(mFirst, -parseISO(mFirst).getUTCDay())
    const weekCount = Math.ceil((daysBetween(gridStart, mLast) + 1) / 7)
    return (
      <div key={mFirst} className="ym">
        <button className="ym-name" onClick={() => onPickMonth(mFirst)}>{parseISO(mFirst).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}</button>
        <div className="ym-dows">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
        {Array.from({ length: weekCount }, (_, wi) => {
          const ws = addDays(gridStart, wi * 7), we = addDays(ws, 6)
          // Phases running this week (within this month), one thin lane each.
          const lanes = phases.filter((p) => p.start <= we && p.end >= ws && p.start <= mLast && p.end >= mFirst)
          return (
            <div key={ws} className="ym-week">
              <div className="ym-days">
                {Array.from({ length: 7 }, (_, di) => {
                  const d = addDays(ws, di)
                  if (d < mFirst || d > mLast) return <span key={d} />
                  const due = dueOn(d)
                  const ms = due.filter((x) => x.milestone)
                  const tip = [...phases.filter((p) => p.start <= d && d <= p.end).map((p) => p.title), ...due.map((x) => `${x.milestone ? '◆' : '•'} ${x.title}`)].join('\n')
                  return (
                    <button key={d} className={`ym-day${d === t ? ' today' : ''}${d < t ? ' past' : ''}`} title={tip || undefined} onClick={() => onPickDay(d)}>
                      {parseISO(d).getUTCDate()}
                      {ms.length > 0
                        ? <i className="ym-ms" style={{ background: milestoneColor(ms[0].task?.milestone_type, 'var(--ink)') }} />
                        : due.length > 0 && <i className="ym-dot" />}
                    </button>
                  )
                })}
              </div>
              {lanes.length > 0 && (
                <div className="ym-bars" style={{ gridTemplateRows: `repeat(${lanes.length}, 4px)` }}>
                  {lanes.map((p, li) => {
                    const s0 = [p.start, ws, mFirst].sort()[2], e0 = [p.end, we, mLast].sort()[0]
                    return (
                      <i key={p.id} title={p.title} className={e0 < t ? 'past' : ''}
                        style={{ gridRow: li + 1, gridColumn: `${daysBetween(ws, s0) + 1} / span ${daysBetween(s0, e0) + 1}`, background: p.color,
                          borderTopLeftRadius: s0 === p.start ? 2 : 0, borderBottomLeftRadius: s0 === p.start ? 2 : 0,
                          borderTopRightRadius: e0 === p.end ? 2 : 0, borderBottomRightRadius: e0 === p.end ? 2 : 0 }} />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="year-view">
      <div className="ym-legend">
        {phases.map((p) => <span key={p.id}><i style={{ background: p.color }} />{p.title}</span>)}
      </div>
      {years.map((y) => (
        <section key={y} className="year-block">
          <h3 className="year-head">{y}</h3>
          <div className="year-grid">{months.filter((m) => m.startsWith(y)).map(monthCard)}</div>
        </section>
      ))}
    </div>
  )
}

export default function CalendarView({
  phases, tasks, people, palette, onShiftTask, onOpenTask, onAddOn, onContextAt,
}: {
  /** Add a task on a day (the + on each day, or a double-click). */
  onAddOn?: (date: string) => void
  /** Right-click: the day and the task under the pointer, if any. */
  onContextAt?: (at: { date: string; task: Task | null; clientX: number; clientY: number }) => void
  phases: Phase[]
  tasks: Task[]
  people: Person[]
  /** Phase colours, in phase order. */
  palette: string[]
  onShiftTask: (task: Task, days: number) => void
  onOpenTask: (task: Task) => void
}) {
  const [scale, setScaleState] = useState<CalScale>(savedScale)
  const setScale = (v: CalScale) => { setScaleState(v); try { localStorage.setItem(SCALE_KEY, v) } catch { /* storage unavailable */ } }
  // The day the view is centred on; month and year views show the month / year it falls in.
  const [focus, setFocus] = useState(() => today())
  const month = monthStart(focus)
  // The day under the pointer (tasks sit on top of the days, so CSS :hover can't tell), for its + button.
  const [hoverDay, setHoverDay] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; grab: string; over: string; moved: boolean } | null>(null)
  const dragRef = useRef(drag)
  useEffect(() => { dragRef.current = drag }, [drag])

  const m = parseISO(month)
  const gridStart = addDays(month, -m.getUTCDay()) // Sunday on or before the 1st
  const monthEnd = toISO(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)))
  const weekCount = Math.ceil((daysBetween(gridStart, monthEnd) + 1) / 7)
  const weekStart = addDays(focus, -parseISO(focus).getUTCDay())
  const weeks = scale === 'week' ? [weekStart] : Array.from({ length: weekCount }, (_, i) => addDays(gridStart, i * 7))
  const t = today()

  const sortedPhases = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  const colorOfPhase = new Map(sortedPhases.map((p, i) => [p.id, palette[i]]))

  const delta = drag?.moved ? daysBetween(drag.grab, drag.over) : 0
  const items: Item[] = [
    ...sortedPhases.map((p) => ({ kind: 'phase' as const, id: p.id, title: p.name, start: p.start_date, end: p.end_date, color: colorOfPhase.get(p.id)!, done: false, milestone: false })),
    ...tasks.flatMap((task) => {
      const s = task.start_date ?? task.due_date, e = task.due_date ?? task.start_date
      if (!s || !e) return []
      const d = drag?.id === task.id ? delta : 0
      return [{
        kind: 'task' as const, id: task.id, title: task.kind === 'sheet' && task.sheet_number ? `${task.sheet_number} ${task.title}` : task.title, start: addDays(s, d), end: addDays(e, d),
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

  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => parseISO(iso).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
  const weekEnd = addDays(weekStart, 6)
  const monthLabel = scale === 'year' ? 'Whole project'
    : scale === 'week'
      ? `${fmt(weekStart, { month: 'short', day: 'numeric' })} – ${weekStart.slice(5, 7) === weekEnd.slice(5, 7) ? Number(weekEnd.slice(8)) : fmt(weekEnd, { month: 'short', day: 'numeric' })}, ${weekEnd.slice(0, 4)}`
      : m.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const shift = (n: number) => {
    if (scale === 'week') return setFocus(addDays(focus, 7 * n))
    const f = parseISO(focus)
    setFocus(toISO(new Date(Date.UTC(f.getUTCFullYear() + (scale === 'year' ? n : 0), f.getUTCMonth() + (scale === 'month' ? n : 0), 1))))
  }
  const isNow = scale === 'week' ? weekStart === addDays(t, -parseISO(t).getUTCDay()) : scale === 'year' ? focus.slice(0, 4) === t.slice(0, 4) : month === monthStart(t)

  return (
    <div className={`calendar cal-${scale}`}>
      <div className="cal-head">
        <h2>{monthLabel}</h2>
        <div className="toolbar">
          <div className="segmented small-seg" aria-label="Calendar view">
            {(['week', 'month', 'year'] as CalScale[]).map((v) => (
              <button key={v} className={scale === v ? 'on' : ''} onClick={() => setScale(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          {scale !== 'year' && (
            <>
              <button className="btn" onClick={() => shift(-1)} title="Earlier">‹</button>
              <button className="btn" onClick={() => setFocus(today())} disabled={isNow}>Today</button>
              <button className="btn" onClick={() => shift(1)} title="Later">›</button>
            </>
          )}
        </div>
      </div>
      {scale === 'year' ? (
        <YearView items={items} today={t}
          onPickMonth={(d) => { setFocus(d); setScale('month') }} onPickDay={(d) => { setFocus(d); setScale('week') }} />
      ) : (<>
      <div className="cal-dow">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className={`cal-grid${drag?.moved ? ' dragging' : ''}`}
        onPointerMove={onAddOn ? (e) => { const d = dayAt(e.clientX, e.clientY); if (d !== hoverDay) setHoverDay(d) } : undefined}
        onPointerLeave={() => setHoverDay(null)}
        onContextMenu={onContextAt ? (e) => {
          const date = dayAt(e.clientX, e.clientY)
          if (!date) return
          e.preventDefault()
          const id = (e.target as HTMLElement).closest<HTMLElement>('[data-task]')?.dataset.task
          onContextAt({ date, task: tasks.find((x) => x.id === id) ?? null, clientX: e.clientX, clientY: e.clientY })
        } : undefined}>
        {weeks.map((ws) => {
          const placed = placeWeek(ws)
          return (
            <div key={ws} className="cal-week" data-week={ws}>
              <div className="cal-days">
                {Array.from({ length: 7 }, (_, i) => {
                  const d = addDays(ws, i)
                  const cls = [d.slice(0, 7) !== month.slice(0, 7) ? 'other' : '', d === t ? 'today' : '', i === 0 || i === 6 ? 'weekend' : ''].join(' ')
                  return (
                    <div key={d} className={`cal-day ${cls}${hoverDay === d && !drag ? ' hovered' : ''}`} onDoubleClick={onAddOn ? () => onAddOn(d) : undefined}>
                      <span>{parseISO(d).getUTCDate()}</span>
                      {onAddOn && <button className="cal-add" title={`Add a task on ${parseISO(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`} onClick={() => onAddOn(d)}>+</button>}
                    </div>
                  )
                })}
              </div>
              <div className="cal-items">
                {placed.map((p) => p.kind === 'phase' ? (
                  <div key={p.id} className="cal-phase" style={{ gridColumn: `${p.col + 1} / span ${p.span}`, gridRow: p.lane + 1, background: p.color }}>
                    {(!p.clippedL || p.col === 0) && <span>{p.title}</span>}
                  </div>
                ) : (
                  <button key={p.id} data-task={p.task?.id}
                    className={`cal-task${p.milestone ? ' milestone' : ''}${p.done ? ' done' : ''}${drag?.id === p.id && drag.moved ? ' lifted' : ''}${p.clippedL ? ' cl' : ''}${p.clippedR ? ' cr' : ''}`}
                    style={{ gridColumn: `${p.col + 1} / span ${p.span}`, gridRow: p.lane + 1, ['--c' as string]: p.color }}
                    title={p.title}
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      e.preventDefault()
                      const grab = dayAt(e.clientX, e.clientY)
                      if (grab) { const d = { id: p.id, grab, over: grab, moved: false }; dragRef.current = d; setDrag(d) }
                    }}>
                    {p.milestone && p.task && <MilestoneMark task={p.task} />}
                    <span className="cal-title">{p.title}</span>
                    {!p.milestone && p.task && whoLabel(p.task, people) && <span className="cal-who">{whoLabel(p.task, people)}</span>}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      </>)}
      <p className="muted small">{scale === 'year' ? 'Bars show the phases running each week; past days are dimmed; ◆ marks milestones and • due dates. Click a month or a day to zoom in. ' : ''}Click + on a day (or right-click) to add a task there. Drag a task to another day to move it (its length stays the same). Click a task to edit it.</p>
    </div>
  )
}
