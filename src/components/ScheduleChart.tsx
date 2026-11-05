import { useRef, useState, type PointerEvent as RPointerEvent, type ReactElement, type RefObject } from 'react'
import { addDays, formatDate, parseISO, shortDate, toISO, today } from '../lib/dates.ts'
import { phaseColors } from '../lib/colors.ts'
import type { Person, Phase, Project, Task } from '../lib/types.ts'
import type { ShownTask } from '../lib/tree.ts'
import { STUDIO_CHART, type ChartColors } from '../lib/theme.ts'
import { whoLabel } from '../lib/assignees.ts'
import { MILESTONE_TYPES, milestoneColor, milestoneType } from '../lib/milestones.ts'

/**
 * The project schedule as one self-contained SVG: header, timeline, phases, tasks, milestones.
 * The same drawing is shown on screen, printed to PDF and saved as PNG, so exports match the screen.
 * When `editable`, bars can be dragged to move them and their ends dragged to change length.
 */

export type ChartMode = 'working' | 'presentation'

/** Drawing width for exports; on screen the chart takes the width it's given so text stays its normal size. */
const EXPORT_W = 1400
const M = 40 // outer margin
const LABEL = 340 // label column width
const HEADER_FULL = 128
const HEADER_BARE = 12
const AXIS = 48
const ROW_PHASE = 36
const ROW_TASK = 26
const ROW_ADD = 24
const FOOTER = 64
const EDGE = 7 // grab width for resizing, in chart units

type Row =
  | { kind: 'phase'; phase: Phase; color: string }
  | { kind: 'task'; task: Task; color: string }
  | { kind: 'group'; label: string; color: string }
  | { kind: 'add'; phase: Phase; color: string }

type DragMode = 'move' | 'start' | 'end'

/** What's under the pointer on the timeline: the day (null over the labels), the phase and the task row, if any. */
export interface ChartSpot { date: string | null; phase: Phase | null; task: Task | null; clientX: number; clientY: number }
interface Drag { kind: 'phase' | 'task'; id: string; mode: DragMode; x0: number; delta: number; moved: boolean }

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

/** Mix two #rrggbb colours: t = 0 gives a, 1 gives b. */
function mixHex(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0)
  const [x, y] = [p(a), p(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

function range(a: string, b: string) {
  const y1 = a.slice(0, 4), y2 = b.slice(0, 4)
  return y1 === y2 ? `${shortDate(a)} – ${shortDate(b)}` : `${shortDate(a)}, ${y1} – ${shortDate(b)}, ${y2}`
}

/** Apply a drag to a pair of dates. Dates that are missing stay missing. */
function dragDates(start: string, end: string, mode: DragMode, d: number): [string, string] {
  if (mode === 'move') return [addDays(start, d), addDays(end, d)]
  if (mode === 'start') { const s = addDays(start, d); return [s > end ? end : s, end] }
  const e = addDays(end, d)
  return [start, e < start ? start : e]
}

export default function ScheduleChart({
  project, phases, tasks, people, mode, firmName, svgRef, editable = false,
  onMovePhase, onMoveTask, onOpenTask, onPan, window: view, showHeader = true, keepOrder = false, colors: C = STUDIO_CHART, onAddAt, onContextAt, presented = (t: Task) => t.client_visible, width, dayMarks = true, onReorder,
}: {
  /** Drag a task's title up or down to reorder it among the rows beside it (same phase and parent). */
  onReorder?: (task: Task, target: Task, place: 'before' | 'after') => void
  /** At day scale (3-month zoom): draw a line and weekday letter for every day and shade weekends. Off: Mondays only. */
  dayMarks?: boolean
  /** Width to draw at, in screen pixels (on screen). Exports leave it out. */
  width?: number
  /** In presentation mode, whether a task is shown (rules plus hand-picked items). */
  presented?: (t: Task) => boolean
  /** Add a task in a phase, starting on a date (from the "+ Add task" rows and double-clicks on empty space). */
  onAddAt?: (phase: Phase, date: string | null) => void
  /** Right-click on the chart: the date and row under the pointer. */
  onContextAt?: (at: ChartSpot) => void
  /** Theme colors for the on-screen chart; exports leave this out and get the neutral presentation look. */
  colors?: ChartColors
  project: Project
  phases: Phase[]
  tasks: Task[]
  people: Person[]
  mode: ChartMode
  firmName: string
  svgRef?: RefObject<SVGSVGElement | null>
  editable?: boolean
  onMovePhase?: (phase: Phase, start: string, end: string, withTasks: boolean) => void
  onMoveTask?: (task: Task, start: string | null, due: string | null) => void
  onOpenTask?: (task: Task) => void
  /** Show only this date range (zoomed in); bars outside it are cut off at the edges. */
  window?: [string, string]
  /** Called while click-and-hold panning the timeline, with days to move the window by. */
  onPan?: (days: number) => void
  showHeader?: boolean
  /** Tasks are already in tree order (with _depth / _rolled): don't re-sort them. */
  keepOrder?: boolean
}) {
  const HEADER = showHeader ? HEADER_FULL : HEADER_BARE
  const W = width ? Math.max(900, Math.round(width)) : EXPORT_W
  const inner = useRef<SVGSVGElement | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [order, setOrder] = useState<{ id: string; y0: number; moved: boolean; target: string | null; place: 'before' | 'after' } | null>(null)
  const pan = useRef<{ x0: number; applied: number } | null>(null)
  const wheelAcc = useRef(0)
  // Placing an undated task or milestone: press in its row where it should start, drag to set its length.
  const [place, setPlace] = useState<{ id: string; a: string; b: string } | null>(null)
  const [panning, setPanning] = useState(false)
  const pres = mode === 'presentation'

  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))
  const byStart = (a: Task, b: Task) =>
    (a.start_date ?? a.due_date ?? '').localeCompare(b.start_date ?? b.due_date ?? '') || a.sort_order - b.sort_order

  const colorOf = phaseColors(project, sorted)
  const palette = sorted.map((p) => colorOf.get(p.id)!)
  const rows: Row[] = []
  sorted.forEach((phase, i) => {
    if (pres && !phase.client_visible) return
    const color = palette[i]
    rows.push({ kind: 'phase', phase, color })
    tasks
      .filter((t) => t.phase_id === phase.id && (!pres || presented(t)))
      .sort(keepOrder ? () => 0 : byStart)
      .forEach((task) => rows.push({ kind: 'task', task, color }))
    if (editable && onAddAt && !pres) rows.push({ kind: 'add', phase, color })
  })
  // Sheet work: a sheet or view, or anything under one (parents looked up among the tasks drawn here).
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const sheetSide = (t: Task) => {
    let cur: Task | undefined = t
    for (let n = 0; cur && n < 12; n++) { if (cur.kind === 'sheet' || cur.kind === 'view') return true; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined }
    return false
  }
  const loose = tasks.filter((t) => !t.phase_id && (!pres || presented(t))).sort(keepOrder ? () => 0 : byStart)
  if (loose.length) {
    rows.push({ kind: 'group', label: 'No phase', color: '#8b8f94' })
    loose.forEach((task) => rows.push({ kind: 'task', task, color: '#8b8f94' }))
  }

  // Time range: whole months around everything shown (plus a month each side while editing,
  // so bars can be dragged past the current ends). Based on saved dates, so it doesn't jump mid-drag.
  const dates: string[] = []
  for (const r of rows) {
    if (r.kind === 'phase') dates.push(r.phase.start_date, r.phase.end_date)
    if (r.kind === 'task') for (const d of [r.task.start_date, r.task.due_date]) if (d) dates.push(d)
  }
  dates.sort()
  const has = dates.length > 0
  const first = has ? dates[0] : today()
  const last = has ? dates[dates.length - 1] : addDays(today(), 90)
  const pad = editable ? 1 : 0
  const fm = parseISO(first)
  const lm = parseISO(last)
  const start = view ? view[0] : toISO(new Date(Date.UTC(fm.getUTCFullYear(), fm.getUTCMonth() - pad, 1)))
  const end = view ? view[1] : toISO(new Date(Date.UTC(lm.getUTCFullYear(), lm.getUTCMonth() + 1 + pad, 0)))
  const days = (parseISO(end).getTime() - parseISO(start).getTime()) / 86400000 + 1

  const x0 = M + LABEL
  const cw = W - M - x0
  const dayW = cw / days
  const x = (iso: string) => x0 + ((parseISO(iso).getTime() - parseISO(start).getTime()) / 86400000) * dayW
  const xEnd = (iso: string) => x(iso) + dayW

  // ---- dragging ----
  const toChartX = (clientX: number) => {
    const el = inner.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * W
  }
  /** The row and day under a pointer position. */
  const spotAt = (clientX: number, clientY: number): ChartSpot => {
    const el = inner.current
    const r = el?.getBoundingClientRect()
    const cx = toChartX(clientX)
    const cy = r ? ((clientY - r.top) / r.height) * H : 0
    let i = -1
    for (let k = 0; k < rowY.length; k++) if (cy >= rowY[k]) i = k
    const row = i >= 0 && cy < rowsBottom ? rows[i] : null
    const date = cx >= x0 && cx <= x0 + cw ? addDays(start, Math.floor((cx - x0) / dayW)) : null
    const phase = !row ? null : row.kind === 'phase' || row.kind === 'add' ? row.phase
      : row.kind === 'task' ? sorted.find((p) => p.id === row.task.phase_id) ?? null : null
    return { date, phase, task: row?.kind === 'task' ? row.task : null, clientX, clientY }
  }
  const startDrag = (e: RPointerEvent, kind: Drag['kind'], id: string, m: DragMode) => {
    if (!editable) return
    e.stopPropagation()
    inner.current?.setPointerCapture(e.pointerId)
    setDrag({ kind, id, mode: m, x0: toChartX(e.clientX), delta: 0, moved: false })
  }
  const toChartY = (clientY: number) => {
    const r = inner.current?.getBoundingClientRect()
    return r ? ((clientY - r.top) / r.height) * H : 0
  }
  /** Pressing a task title: a click opens it; dragging up or down reorders it among its neighbours. */
  const startOrder = (e: RPointerEvent, t: Task) => {
    if (!editable || e.button !== 0) return
    e.stopPropagation()
    inner.current?.setPointerCapture(e.pointerId)
    setOrder({ id: t.id, y0: toChartY(e.clientY), moved: false, target: null, place: 'before' })
  }
  const sibling = (a: Task, b: Task) => a.id !== b.id && a.phase_id === b.phase_id && (a.parent_id ?? null) === (b.parent_id ?? null)
  const startPan = (e: RPointerEvent) => {
    if (!onPan || e.button !== 0) return
    inner.current?.setPointerCapture(e.pointerId)
    pan.current = { x0: toChartX(e.clientX), applied: 0 }
    setPanning(true)
  }
  const dateAt = (clientX: number) => addDays(start, Math.max(0, Math.floor((toChartX(clientX) - x0) / dayW)))
  const startPlace = (e: RPointerEvent, id: string) => {
    if (!editable || e.button !== 0) return
    e.stopPropagation()
    inner.current?.setPointerCapture(e.pointerId)
    const d = dateAt(e.clientX)
    setPlace({ id, a: d, b: d })
  }
  const onMove = (e: RPointerEvent) => {
    if (order) {
      const cy = toChartY(e.clientY)
      const moved = order.moved || Math.abs(cy - order.y0) > 4
      const me = tasks.find((x) => x.id === order.id)
      let target: string | null = null, at: 'before' | 'after' = 'before'
      if (moved && me) {
        rows.forEach((r, k) => {
          if (r.kind !== 'task' || !sibling(me, r.task)) return
          if (cy >= rowY[k] && cy < rowY[k] + ROW_TASK) { target = r.task.id; at = cy < rowY[k] + ROW_TASK / 2 ? 'before' : 'after' }
        })
      }
      if (moved !== order.moved || target !== order.target || at !== order.place) setOrder({ ...order, moved, target, place: at })
      return
    }
    if (place) {
      const b = dateAt(e.clientX)
      if (b !== place.b) setPlace({ ...place, b })
      return
    }
    if (pan.current) {
      // Drag right to see earlier dates, left to see later ones.
      const d = Math.round((toChartX(e.clientX) - pan.current.x0) / dayW)
      if (d !== pan.current.applied) { onPan?.(-(d - pan.current.applied)); pan.current.applied = d }
      return
    }
    if (!drag) return
    const dx = toChartX(e.clientX) - drag.x0
    const delta = Math.round(dx / dayW)
    const moved = drag.moved || Math.abs(dx) > 4
    if (delta !== drag.delta || moved !== drag.moved) setDrag({ ...drag, delta, moved })
  }
  const endDrag = () => {
    if (order) {
      const o = order
      setOrder(null)
      const t = tasks.find((x) => x.id === o.id)
      if (!t) return
      if (!o.moved) { onOpenTask?.(t); return }
      const target = tasks.find((x) => x.id === o.target)
      if (target) onReorder?.(t, target, o.place)
      return
    }
    if (place) {
      const pl = place
      setPlace(null)
      const t = tasks.find((x) => x.id === pl.id)
      if (!t) return
      const [a, b] = pl.a <= pl.b ? [pl.a, pl.b] : [pl.b, pl.a]
      // A click places a week (or the milestone's day); a drag sets the span.
      if (t.is_milestone) onMoveTask?.(t, null, pl.a)
      else onMoveTask?.(t, a, a === b ? addDays(a, 4) : b)
      return
    }
    if (pan.current) { pan.current = null; setPanning(false); return }
    if (!drag) return
    const d = drag
    setDrag(null)
    if (d.kind === 'task') {
      const t = tasks.find((x) => x.id === d.id)
      if (!t) return
      if (!d.moved) { onOpenTask?.(t); return }
      if (!d.delta) return
      const s0 = t.start_date ?? t.due_date!, e0 = t.due_date ?? t.start_date!
      const [s, e] = dragDates(s0, e0, t.is_milestone || (t as ShownTask)._rolled ? 'move' : d.mode, d.delta)
      onMoveTask?.(t, t.start_date ? s : null, t.due_date ? e : null)
    } else {
      const p = phases.find((x) => x.id === d.id)
      if (!p || !d.moved || !d.delta) return
      const [s, e] = dragDates(p.start_date, p.end_date, d.mode, d.delta)
      onMovePhase?.(p, s, e, d.mode === 'move')
    }
  }

  /** Dates to draw, including any drag in progress (moving a phase carries its tasks). */
  const phaseDates = (p: Phase): [string, string] =>
    drag?.kind === 'phase' && drag.id === p.id ? dragDates(p.start_date, p.end_date, drag.mode, drag.delta) : [p.start_date, p.end_date]
  const taskDates = (t: Task): [string | null, string | null] => {
    const s0 = t.start_date ?? t.due_date, e0 = t.due_date ?? t.start_date
    if (!s0 || !e0) return [null, null]
    let d = 0, m: DragMode = 'move'
    if (drag?.kind === 'task' && drag.id === t.id) { d = drag.delta; m = t.is_milestone || (t as ShownTask)._rolled ? 'move' : drag.mode }
    else if (drag?.kind === 'phase' && drag.mode === 'move' && drag.id === t.phase_id) d = drag.delta
    return d ? dragDates(s0, e0, m, d) : [s0, e0]
  }
  const dragging = (kind: Drag['kind'], id: string) => drag?.moved && drag.kind === kind && drag.id === id

  // ---- axis ----
  const months: { x1: number; x2: number; label: string; year: number; month: number }[] = []
  for (let d = parseISO(start.slice(0, 8) + '01'); toISO(d) <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    months.push({
      x1: Math.max(x0, x(toISO(d))), x2: next > parseISO(end) ? x0 + cw : x(toISO(next)),
      label: d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }),
      year: d.getUTCFullYear(), month: d.getUTCMonth(),
    })
  }
  const monthW = months.length ? cw / months.length : cw
  const years = months.reduce<{ year: number; x1: number; x2: number }[]>((acc, m) => {
    const lastY = acc[acc.length - 1]
    if (lastY && lastY.year === m.year) lastY.x2 = m.x2
    else acc.push({ year: m.year, x1: m.x1, x2: m.x2 })
    return acc
  }, [])

  // Tick detail follows the zoom: days at about 3 months, weeks at about 6, months beyond.
  const scale: 'month' | 'week' | 'day' = view ? (days <= 100 ? 'day' : days <= 200 ? 'week' : 'month') : 'month'
  const dayList: string[] = []
  if (scale !== 'month') for (let d = start; d <= end; d = addDays(d, 1)) dayList.push(d)
  const dow = (iso: string) => parseISO(iso).getUTCDay()

  const axisTop = HEADER
  const daily = scale === 'day' && dayMarks
  const rowsTop = axisTop + (daily ? AXIS + 12 : AXIS)
  const rowY: number[] = []
  let y = rowsTop
  for (const r of rows) { rowY.push(y); y += r.kind === 'task' ? ROW_TASK : r.kind === 'add' ? ROW_ADD : ROW_PHASE }
  const rowsBottom = y
  const H = rowsBottom + FOOTER

  const t = today()
  const showToday = has && t >= start && t <= end

  // Legend: one diamond per kind of milestone actually on the chart, then Today.
  const shownMilestones = rows.filter((r): r is Extract<Row, { kind: 'task' }> => r.kind === 'task' && r.task.is_milestone)
  const usedTypes = MILESTONE_TYPES.filter((m) => shownMilestones.some((r) => r.task.milestone_type === m.value))
  const untyped = shownMilestones.some((r) => !milestoneType(r.task.milestone_type))
  const legendMarks: { key: string; kind: 'diamond' | 'today'; color: string; label: string; x: number }[] = []
  {
    let lx = 172
    const push = (key: string, kind: 'diamond' | 'today', color: string, label: string) => {
      legendMarks.push({ key, kind, color, label, x: lx })
      lx += 18 + label.length * 6.3 + 20
    }
    if (untyped) push('ms', 'diamond', C.ink, usedTypes.length ? 'Other milestone' : 'Milestone')
    for (const m of usedTypes) push(m.value, 'diamond', m.color, m.label)
    if (showToday) push('today', 'today', C.accent, 'Today')
  }

  /** Invisible grab areas over a bar: middle moves, ends resize. */
  const handles = (kind: Drag['kind'], id: string, bx: number, bw: number, top: number, h: number, resizable: boolean) => {
    if (!editable) return null
    const ew = resizable ? Math.min(EDGE, bw / 3) : 0
    return (
      <g className="handles" style={{ touchAction: 'none' }}>
        <rect x={bx + ew} y={top} width={Math.max(4, bw - 2 * ew)} height={h} fill="transparent"
          style={{ cursor: drag ? 'grabbing' : 'grab' }} data-drag={`${kind}:${id}:move`} onPointerDown={(e) => startDrag(e, kind, id, 'move')} />
        {resizable && (
          <>
            <rect x={bx - 3} y={top} width={ew + 3} height={h} fill="transparent" style={{ cursor: 'ew-resize' }} data-drag={`${kind}:${id}:start`}
              onPointerDown={(e) => startDrag(e, kind, id, 'start')} />
            <rect x={bx + bw - ew} y={top} width={ew + 3} height={h} fill="transparent" style={{ cursor: 'ew-resize' }} data-drag={`${kind}:${id}:end`}
              onPointerDown={(e) => startDrag(e, kind, id, 'end')} />
          </>
        )}
      </g>
    )
  }
  const dragLabel = (bx: number, bw: number, cy: number, text: string) => (
    <g pointerEvents="none">
      <rect x={bx + bw + 8} y={cy - 10} width={text.length * 6.6 + 14} height={20} rx={4} fill={C.ink} />
      <text x={bx + bw + 15} y={cy + 4} fontSize={11.5} fontWeight={600} fill={C.bg}>{text}</text>
    </g>
  )

  return (
    <svg
      ref={(el) => { inner.current = el; if (svgRef) svgRef.current = el }}
      xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%"
      style={{ display: 'block', height: 'auto', userSelect: editable ? 'none' : undefined, touchAction: editable ? 'pan-y' : undefined }}
      fontFamily={C.font} role="img" aria-label={`${project.name} schedule`}
      onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={() => { setDrag(null); setPlace(null); setOrder(null); pan.current = null; setPanning(false) }}
      onWheel={onPan ? (e) => {
        // Sideways scrolling (trackpad swipe, Shift+wheel) moves through time in the zoomed views.
        const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0
        if (!dx) return
        wheelAcc.current += dx
        const pxPerDay = Math.max(4, dayW * ((inner.current?.getBoundingClientRect().width ?? W) / W))
        const days = Math.trunc(wheelAcc.current / pxPerDay)
        if (days) { wheelAcc.current -= days * pxPerDay; onPan(days) }
      } : undefined}
      onContextMenu={onContextAt ? (e) => { e.preventDefault(); e.stopPropagation(); onContextAt(spotAt(e.clientX, e.clientY)) } : undefined}
      onDoubleClick={onAddAt ? (e) => {
        if (!(e.target as Element).closest('[data-pan]')) return
        const spot = spotAt(e.clientX, e.clientY)
        if (spot.phase) onAddAt(spot.phase, spot.date)
      } : undefined}
    >
      <rect x={0} y={0} width={W} height={H} fill={C.bg} />

      {/* Header */}
      {showHeader && <>
      <text x={M} y={44} fontSize={12} fontWeight={600} letterSpacing={2.4} fill={C.accent}>{firmName.toUpperCase()}</text>
      <text x={M} y={80} fontSize={28} fontWeight={600} fill={C.ink}>{clip(project.name, 60)}</text>
      <text x={M} y={106} fontSize={14} fill={C.muted}>
        {[project.number, project.client].filter(Boolean).join('  ·  ') || ' '}
      </text>
      <text x={W - M} y={44} fontSize={12} fontWeight={600} letterSpacing={2.4} fill={C.muted} textAnchor="end">
        {pres ? 'PROJECT SCHEDULE' : 'WORKING SCHEDULE'}
      </text>
      <text x={W - M} y={80} fontSize={14} fill={C.ink} textAnchor="end">Prepared {formatDate(t)}</text>
      {has && <text x={W - M} y={106} fontSize={14} fill={C.muted} textAnchor="end">{range(first, last)}</text>}
      <line x1={M} x2={W - M} y1={HEADER - 8} y2={HEADER - 8} stroke={C.ink} strokeWidth={1.2} />
      </>}
      <defs><clipPath id="chart-area"><rect x={x0} y={0} width={cw} height={100000} /></clipPath></defs>

      {/* Timeline axis */}
      {scale === 'month' ? (
        <>
          {years.map((yr) => (
            <text key={yr.year} x={Math.max(yr.x1, x0) + 6} y={axisTop + 16} fontSize={11} fontWeight={600} fill={C.ink}>{yr.year}</text>
          ))}
          {months.map((m) => (
            <g key={`${m.year}-${m.month}`}>
              <line x1={m.x1} x2={m.x1} y1={m.month === 0 || m.x1 === x0 ? axisTop + 2 : axisTop + 24} y2={rowsBottom} stroke={m.month === 0 ? C.lineStrong : C.line} strokeWidth={1} />
              <text x={(m.x1 + m.x2) / 2} y={axisTop + 38} fontSize={11} fill={C.muted} textAnchor="middle">
                {monthW >= 30 ? m.label : m.label[0]}
              </text>
            </g>
          ))}
        </>
      ) : (
        <>
          {scale === 'day' && !dayMarks && dayList.filter((d) => dow(d) === 1).map((d) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={axisTop + 22} y2={rowsBottom} stroke={C.lineStrong} />
              <text x={x(d) + 3} y={axisTop + 36} fontSize={10.5} fontWeight={500} fill={C.ink}>{parseISO(d).getUTCDate()}</text>
            </g>
          ))}
          {daily && dayList.map((d) => {
            // Days: a line per day, the date on each Monday, and a weekday letter under every day.
            const w = dow(d)
            const weekend = w === 0 || w === 6
            return (
              <g key={d}>
                <line x1={x(d)} x2={x(d)} y1={w === 1 ? axisTop + 22 : axisTop + 42} y2={rowsBottom} stroke={w === 1 ? C.lineStrong : C.lineFaint} />
                {w === 1 && <text x={x(d) + 3} y={axisTop + 36} fontSize={10.5} fontWeight={500} fill={C.ink}>{parseISO(d).getUTCDate()}</text>}
                <text x={x(d) + dayW / 2} y={axisTop + 54} fontSize={9} fill={weekend ? C.faint : C.muted} textAnchor="middle">
                  {'SMTWTFS'[w]}
                </text>
              </g>
            )
          })}
          {scale === 'week' && dayList.filter((d) => dow(d) === 1).map((d) => (
            <g key={d}>
              <line x1={x(d)} x2={x(d)} y1={axisTop + 26} y2={rowsBottom} stroke={C.line} />
              <text x={x(d) + 4} y={axisTop + 39} fontSize={10.5} fill={C.muted}>{parseISO(d).getUTCDate()}</text>
            </g>
          ))}
          {months.map((m) => (
            <g key={`${m.year}-${m.month}`}>
              <line x1={m.x1} x2={m.x1} y1={axisTop + 2} y2={rowsBottom} stroke={C.lineStrong} />
              {m.x2 - m.x1 > 34 && (
                <text x={showToday && x(t) >= m.x1 - 24 && x(t) < m.x1 + 90 ? Math.max(m.x1 + 6, x(t) + 28) : m.x1 + 6}
                  y={axisTop + 16} fontSize={11} fontWeight={600} fill={C.ink}>
                  {m.x2 - m.x1 > 90 ? `${m.label} ${m.year}` : m.label}
                </text>
              )}
            </g>
          ))}
        </>
      )}
      <line x1={x0 + cw} x2={x0 + cw} y1={axisTop + 2} y2={rowsBottom} stroke={C.line} />
      <line x1={M} x2={W - M} y1={rowsTop} y2={rowsTop} stroke={C.lineStrong} />

      {/* Working view only: the Overview's layered paper in the label column. Each phase is a base sheet (framed in a
          light tint of its colour), general tasks and sheet work sit on sheets stepped in on top, and each row on a
          plain sheet stepped in again (deeper rows further). The presentation view stays clean. */}
      {!pres && (() => {
        const out: ReactElement[] = []
        const kindColor = (t: Task) => (sheetSide(t) ? '#8e3b6e' : '#c98a12')
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i]
          if (r.kind !== 'phase' && r.kind !== 'group') continue
          let j = i + 1
          while (j < rows.length && rows[j].kind !== 'phase' && rows[j].kind !== 'group') j++
          const top = rowY[i], bottom = j < rows.length ? rowY[j] : rowsBottom
          out.push(<rect key={`pp${i}`} x={M + 0.5} y={top + 0.5} width={x0 - M - 1} height={bottom - top - 3} rx={6}
            fill={C.band} stroke={mixHex(r.color, C.line, 0.62)} />)
          // Runs of rows of one kind (general tasks / sheet work): one stepped sheet each.
          let k = i + 1
          while (k < j) {
            const rk = rows[k]
            if (rk.kind !== 'task') { k++; continue }
            const side = sheetSide(rk.task)
            let e = k
            while (e + 1 < j && rows[e + 1].kind === 'task' && sheetSide((rows[e + 1] as { task: Task }).task) === side) e++
            const kc = kindColor(rk.task)
            const ry0 = rowY[k], ry1 = rowY[e] + ROW_TASK
            out.push(<rect key={`pk${k}`} x={M + 8} y={ry0 + 1} width={x0 - M - 8} height={ry1 - ry0 - 2} rx={5}
              fill={mixHex(kc, C.bg, 0.92)} stroke={mixHex(kc, C.line, 0.7)} />)
            for (let q = k; q <= e; q++) {
              const t = (rows[q] as { task: Task }).task
              const d = Math.min(4, (t as ShownTask)._depth ?? 0)
              const lx = M + 16 + d * 12
              out.push(<rect key={`pr${q}`} x={lx} y={rowY[q] + 2} width={x0 - lx - 1} height={ROW_TASK - 3} rx={3} fill={C.bg} />)
            }
            k = e + 1
          }
        }
        return <g pointerEvents="none">{out}</g>
      })()}
      {/* Rows: backgrounds and labels first, bars on top */}
      {rows.map((r, i) => {
        const ry = rowY[i]
        if (r.kind === 'group' || r.kind === 'phase') {
          const label = r.kind === 'phase' ? r.phase.name : r.label
          const [ps, pe] = r.kind === 'phase' ? phaseDates(r.phase) : ['', '']
          return (
            <g key={i}>
              <rect x={M} y={ry} width={W - 2 * M} height={ROW_PHASE} fill={C.band} />
              <line x1={M} x2={W - M} y1={ry} y2={ry} stroke={C.line} />
              <rect x={M} y={ry + 8} width={4} height={ROW_PHASE - 16} rx={2} fill={r.color} />
              <text x={M + 14} y={ry + 23} fontSize={14} fontWeight={600} fill={C.ink}>{clip(label, 31)}</text>
              {r.kind === 'phase' && (
                <text x={x0 - 14} y={ry + 23} fontSize={11} fill={C.muted} textAnchor="end">{`${shortDate(ps)} – ${shortDate(pe)}`}</text>
              )}
            </g>
          )
        }
        if (r.kind === 'add') {
          const phase = r.phase
          return (
            <g key={i} className="chart-add" style={{ cursor: 'pointer' }} onClick={() => onAddAt?.(phase, null)}>
              <rect x={M} y={ry} width={x0 - M} height={ROW_ADD} fill="transparent" />
              <text x={M + 30} y={ry + 16} fontSize={12} fill={C.muted}>+ Add task</text>
            </g>
          )
        }
        const task = r.task
        const cy = ry + ROW_TASK / 2
        const [ts, te] = taskDates(task)
        const right = pres
          ? (task.is_milestone ? (te ? formatDate(te) : '') : ts && te ? range(ts, te) : '')
          : whoLabel(task, people)
        return (
          <g key={i} opacity={task.status === 'done' && !pres ? 0.55 : 1}>
            <text x={M + 30 + Math.min(4, (task as ShownTask)._depth ?? 0) * 14} y={cy + 4} fontSize={12.5} fill={C.ink}
              fontWeight={task.kind === 'sheet' ? 600 : 400}
              opacity={order?.moved && order.id === task.id ? 0.4 : 1}
              style={editable ? { cursor: order?.moved ? 'grabbing' : onReorder ? 'grab' : 'pointer' } : undefined}
              onPointerDown={editable && onReorder ? (e) => startOrder(e, task) : undefined}
              onClick={editable && !onReorder ? () => onOpenTask?.(task) : undefined}>
              {clip(`${task.kind === 'sheet' && task.sheet_number ? `${task.sheet_number}  ` : ''}${task.title}`, (pres ? 34 : 38) - Math.min(4, (task as ShownTask)._depth ?? 0) * 2)}
            </text>
            <text x={x0 - 14} y={cy + 4} fontSize={11} fill={C.muted} textAnchor="end">{right}</text>
          </g>
        )
      })}

      {order?.moved && order.target && (() => {
        const k = rows.findIndex((r) => r.kind === 'task' && r.task.id === order.target)
        if (k < 0) return null
        const ly = order.place === 'before' ? rowY[k] : rowY[k] + ROW_TASK
        return <g pointerEvents="none"><line x1={M + 24} x2={W - M} y1={ly} y2={ly} stroke={C.accent} strokeWidth={2} /><circle cx={M + 24} cy={ly} r={3.5} fill={C.accent} /></g>
      })()}
      {daily && (
        <g pointerEvents="none">
          {dayList.filter((d) => dow(d) === 0 || dow(d) === 6).map((d) => (
            <rect key={d} x={x(d)} y={rowsTop} width={dayW} height={rowsBottom - rowsTop} fill={C.ink} opacity={0.035} />
          ))}
        </g>
      )}
      {onPan && (
        <rect x={x0} y={axisTop} width={cw} height={rowsBottom - axisTop} fill="transparent"
          style={{ cursor: panning ? 'grabbing' : 'grab' }} data-pan="1" onPointerDown={startPan} />
      )}
      <g clipPath={view ? 'url(#chart-area)' : undefined}>
      {rows.map((r, i) => {
        const ry = rowY[i]
        if (r.kind === 'phase') {
          const [ps, pe] = phaseDates(r.phase)
          const bx = x(ps), bw = Math.max(2, xEnd(pe) - bx)
          return (
            <g key={`b${i}`}>
              <rect x={bx} y={ry + 10} width={bw} height={16} rx={3} fill={r.color}
                stroke={dragging('phase', r.phase.id) ? C.ink : 'none'} strokeWidth={1.5} />
              {editable && <rect x={bx + 3} y={ry + 15} width={2} height={6} rx={1} fill="#fff" opacity={0.6} pointerEvents="none" />}
              {editable && <rect x={bx + bw - 5} y={ry + 15} width={2} height={6} rx={1} fill="#fff" opacity={0.6} pointerEvents="none" />}
              {handles('phase', r.phase.id, bx, bw, ry + 6, 24, true)}
              {dragging('phase', r.phase.id) && dragLabel(bx, bw, ry + 18, `${shortDate(ps)} – ${shortDate(pe)}`)}
            </g>
          )
        }
        if (r.kind !== 'task') return null
        const task = r.task
        const done = task.status === 'done'
        const cy = ry + ROW_TASK / 2
        const [ts, te] = taskDates(task)
        if (!ts || !te) {
          // Not placed yet: the whole row is the place to click.
          if (!editable || pres || (task as ShownTask)._rolled) return null
          const pl = place?.id === task.id ? place : null
          const [a, b] = pl ? (pl.a <= pl.b ? [pl.a, pl.b] : [pl.b, pl.a]) : ['', '']
          return (
            <g key={`b${i}`} className="placer">
              <rect x={x0} y={ry + 1} width={cw} height={ROW_TASK - 2} fill={C.accent} opacity={pl ? 0.06 : 0.035} rx={3}
                style={{ cursor: 'crosshair', touchAction: 'none' }} data-drag={`place:${task.id}`} onPointerDown={(e) => startPlace(e, task.id)} />
              {pl && (task.is_milestone
                ? <rect x={x(pl.a) + dayW / 2 - 5.5} y={cy - 5.5} width={11} height={11} fill={C.accent} transform={`rotate(45 ${x(pl.a) + dayW / 2} ${cy})`} pointerEvents="none" />
                : <rect x={x(a)} y={cy - 4} width={Math.max(dayW, xEnd(b) - x(a))} height={8} rx={2} fill={C.accent} opacity={0.75} pointerEvents="none" />)}
              {pl
                ? dragLabel(task.is_milestone ? x(pl.a) : x(a), task.is_milestone ? 12 : Math.max(dayW, xEnd(b) - x(a)), cy, task.is_milestone || a === b ? shortDate(pl.a) : `${shortDate(a)} – ${shortDate(b)}`)
                : <text x={x0 + 10} y={cy + 4} fontSize={11} fill={C.accent} pointerEvents="none">
                    {task.is_milestone ? 'Click the day this milestone falls on' : 'Click where it starts, or drag across its dates'}
                  </text>}
            </g>
          )
        }
        const active = dragging('task', task.id)
        if (task.is_milestone) {
          const cx = x(te) + dayW / 2
          return (
            <g key={`b${i}`} opacity={done && !pres ? 0.55 : 1}>
              <rect x={cx - 5.5} y={cy - 5.5} width={11} height={11} fill={active ? C.accent : milestoneColor(task.milestone_type, C.ink)} transform={`rotate(45 ${cx} ${cy})`} />
              {!active && <text x={cx + 12} y={cy + 4} fontSize={11} fill={C.muted} pointerEvents="none">{shortDate(te)}</text>}
              {/* Grab the diamond or its date label to move it. */}
              {handles('task', task.id, cx - 12, 12 + 12 + shortDate(te).length * 6.5, cy - 11, 22, false)}
              {active && dragLabel(cx - 6, 12, cy, shortDate(te))}
            </g>
          )
        }
        const bx = x(ts), bw = Math.max(3, xEnd(te) - bx)
        if ((task as ShownTask)._rolled) {
          // Spans what's under it: a summary bracket that moves the whole branch.
          return (
            <g key={`b${i}`} opacity={done ? 0.5 : 1}>
              <rect x={bx} y={cy - 3} width={bw} height={6} rx={1} fill={r.color} stroke={active ? C.ink : 'none'} />
              <path d={`M${bx} ${cy - 3} v10 l5 -4 z M${bx + bw} ${cy - 3} v10 l-5 -4 z`} fill={r.color} />
              {handles('task', task.id, bx, bw, cy - 10, 20, false)}
              {active && dragLabel(bx, bw, cy, `${shortDate(ts)} – ${shortDate(te)}`)}
            </g>
          )
        }
        return (
          <g key={`b${i}`}>
            <rect x={bx} y={cy - 4} width={bw} height={8} rx={2} fill={r.color} opacity={active ? 0.9 : done ? 0.35 : 0.6}
              stroke={active ? C.ink : 'none'} strokeWidth={1} />
            {handles('task', task.id, bx, bw, cy - 10, 20, true)}
            {active && dragLabel(bx, bw, cy, `${shortDate(ts)} – ${shortDate(te)}`)}
          </g>
        )
      })}
      </g>
      <line x1={M} x2={W - M} y1={rowsBottom} y2={rowsBottom} stroke={C.lineStrong} />

      {showToday && (
        <g pointerEvents="none">
          <line x1={x(t)} x2={x(t)} y1={axisTop + 22} y2={rowsBottom} stroke={C.accent} strokeWidth={1.4} strokeDasharray="4 3" />
          <rect x={x(t) - 22} y={axisTop + 4} width={44} height={16} rx={8} fill={C.accent} />
          <text x={x(t)} y={axisTop + 16} fontSize={10} fontWeight={600} fill={C.onAccent} textAnchor="middle">TODAY</text>
        </g>
      )}

      {!has && <text x={x0 + cw / 2} y={rowsTop + 40} fontSize={14} fill={C.muted} textAnchor="middle">Nothing to show yet.</text>}

      {/* Legend and footer */}
      <g transform={`translate(${M}, ${rowsBottom + 34})`} fontSize={11} fill={C.muted}>
        <rect x={0} y={-9} width={26} height={12} rx={3} fill={palette[Math.min(2, palette.length - 1)]} />
        <text x={34} y={1}>Phase</text>
        <rect x={86} y={-6} width={26} height={7} rx={2} fill={palette[Math.min(2, palette.length - 1)]} opacity={0.6} />
        <text x={120} y={1}>{pres ? 'Activity' : 'Task'}</text>
        {legendMarks.map((m) => (
          <g key={m.key}>
            {m.kind === 'diamond'
              ? <rect x={m.x} y={-8} width={9} height={9} fill={m.color} transform={`rotate(45 ${m.x + 4.5} -3.5)`} />
              : <line x1={m.x + 4} x2={m.x + 4} y1={-10} y2={4} stroke={C.accent} strokeWidth={1.4} strokeDasharray="4 3" />}
            <text x={m.x + 18} y={1}>{m.label}</text>
          </g>
        ))}
        <text x={W - 2 * M} y={1} textAnchor="end">
          {pres ? '' : 'Working schedule. Initials show who is assigned.'}
        </text>
      </g>
    </svg>
  )
}
