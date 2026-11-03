import type { Ref } from 'react'
import { addDays, formatDate, parseISO, toISO, today } from '../lib/dates.ts'
import { phaseColor } from '../lib/phases.ts'
import type { Person, Phase, Project, Task } from '../lib/types.ts'

/**
 * The project schedule as one self-contained SVG: header, timeline, phases, tasks, milestones.
 * The same drawing is shown on screen, printed to PDF and saved as PNG, so exports match the screen.
 */

export type ChartMode = 'internal' | 'client'

const W = 1400
const M = 40 // outer margin
const LABEL = 340 // label column width
const HEADER = 128
const AXIS = 48
const ROW_PHASE = 36
const ROW_TASK = 26
const FOOTER = 64
const FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"

const INK = '#1c1f23'
const MUTED = '#6b7178'
const LINE = '#e7e4de'
const ACCENT = '#b5502d'

type Row =
  | { kind: 'phase'; phase: Phase; color: string }
  | { kind: 'task'; task: Task; color: string }
  | { kind: 'group'; label: string; color: string }

function clip(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

function shortDate(iso: string) {
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function range(a: string, b: string) {
  const y1 = a.slice(0, 4), y2 = b.slice(0, 4)
  return y1 === y2 ? `${shortDate(a)} – ${shortDate(b)}` : `${shortDate(a)}, ${y1} – ${shortDate(b)}, ${y2}`
}

export default function ScheduleChart({
  project, phases, tasks, people, mode, firmName, svgRef,
}: {
  project: Project
  phases: Phase[]
  tasks: Task[]
  people: Person[]
  mode: ChartMode
  firmName: string
  svgRef?: Ref<SVGSVGElement>
}) {
  const client = mode === 'client'
  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))
  const byStart = (a: Task, b: Task) =>
    (a.start_date ?? a.due_date ?? '').localeCompare(b.start_date ?? b.due_date ?? '') || a.sort_order - b.sort_order

  const rows: Row[] = []
  sorted.forEach((phase, i) => {
    if (client && !phase.client_visible) return
    const color = phaseColor(i)
    rows.push({ kind: 'phase', phase, color })
    tasks
      .filter((t) => t.phase_id === phase.id && (!client || t.client_visible))
      .sort(byStart)
      .forEach((task) => rows.push({ kind: 'task', task, color }))
  })
  const loose = tasks.filter((t) => !t.phase_id && (!client || t.client_visible)).sort(byStart)
  if (loose.length) {
    rows.push({ kind: 'group', label: 'Other', color: '#8b8f94' })
    loose.forEach((task) => rows.push({ kind: 'task', task, color: '#8b8f94' }))
  }

  // Time range: whole months around everything shown.
  const dates: string[] = []
  for (const r of rows) {
    if (r.kind === 'phase') dates.push(r.phase.start_date, r.phase.end_date)
    if (r.kind === 'task') for (const d of [r.task.start_date, r.task.due_date]) if (d) dates.push(d)
  }
  dates.sort()
  const has = dates.length > 0
  const first = has ? dates[0] : today()
  const last = has ? dates[dates.length - 1] : addDays(today(), 90)
  const start = first.slice(0, 8) + '01'
  const endMonth = parseISO(last.slice(0, 8) + '01')
  const end = toISO(new Date(Date.UTC(endMonth.getUTCFullYear(), endMonth.getUTCMonth() + 1, 0)))
  const days = (parseISO(end).getTime() - parseISO(start).getTime()) / 86400000 + 1

  const x0 = M + LABEL
  const cw = W - M - x0
  const x = (iso: string) => x0 + (((parseISO(iso).getTime() - parseISO(start).getTime()) / 86400000) / days) * cw
  const xEnd = (iso: string) => x(addDays(iso, 1))

  // Months and years along the top.
  const months: { x1: number; x2: number; label: string; year: number; month: number }[] = []
  for (let d = parseISO(start); toISO(d) <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    months.push({
      x1: x(toISO(d)), x2: next > parseISO(end) ? x0 + cw : x(toISO(next)),
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

  const axisTop = HEADER
  const rowsTop = axisTop + AXIS
  const rowY: number[] = []
  let y = rowsTop
  for (const r of rows) { rowY.push(y); y += r.kind === 'task' ? ROW_TASK : ROW_PHASE }
  const rowsBottom = y
  const H = rowsBottom + FOOTER

  const t = today()
  const showToday = has && t >= start && t <= end
  const initials = (id: string | null) => {
    const p = people.find((x) => x.id === id)
    return p ? p.initials ?? p.name.split(' ').map((w) => w[0]).join('').slice(0, 3) : ''
  }

  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W} ${H}`} width="100%"
      style={{ display: 'block', height: 'auto' }} fontFamily={FONT} role="img"
      aria-label={`${project.name} schedule`}>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" />

      {/* Header */}
      <text x={M} y={44} fontSize={12} fontWeight={600} letterSpacing={2.4} fill={ACCENT}>{firmName.toUpperCase()}</text>
      <text x={M} y={80} fontSize={28} fontWeight={600} fill={INK}>{clip(project.name, 60)}</text>
      <text x={M} y={106} fontSize={14} fill={MUTED}>
        {[project.number, project.client].filter(Boolean).join('  ·  ') || ' '}
      </text>
      <text x={W - M} y={44} fontSize={12} fontWeight={600} letterSpacing={2.4} fill={MUTED} textAnchor="end">
        {client ? 'PROJECT SCHEDULE' : 'INTERNAL WORKING SCHEDULE'}
      </text>
      <text x={W - M} y={80} fontSize={14} fill={INK} textAnchor="end">Prepared {formatDate(t)}</text>
      {has && <text x={W - M} y={106} fontSize={14} fill={MUTED} textAnchor="end">{range(first, last)}</text>}
      <line x1={M} x2={W - M} y1={HEADER - 8} y2={HEADER - 8} stroke={INK} strokeWidth={1.2} />

      {/* Timeline axis */}
      {years.map((yr) => (
        <text key={yr.year} x={Math.max(yr.x1, x0) + 6} y={axisTop + 16} fontSize={11} fontWeight={600} fill={INK}>{yr.year}</text>
      ))}
      {months.map((m) => (
        <g key={`${m.year}-${m.month}`}>
          <line x1={m.x1} x2={m.x1} y1={m.month === 0 || m.x1 === x0 ? axisTop + 2 : axisTop + 24} y2={rowsBottom} stroke={m.month === 0 ? '#d6d2ca' : LINE} strokeWidth={1} />
          <text x={(m.x1 + m.x2) / 2} y={axisTop + 38} fontSize={11} fill={MUTED} textAnchor="middle">
            {monthW >= 30 ? m.label : m.label[0]}
          </text>
        </g>
      ))}
      <line x1={x0 + cw} x2={x0 + cw} y1={axisTop + 2} y2={rowsBottom} stroke={LINE} />
      <line x1={M} x2={W - M} y1={rowsTop} y2={rowsTop} stroke="#d6d2ca" />

      {/* Rows */}
      {rows.map((r, i) => {
        const ry = rowY[i]
        if (r.kind === 'group' || r.kind === 'phase') {
          const label = r.kind === 'phase' ? r.phase.name : r.label
          return (
            <g key={i}>
              <rect x={M} y={ry} width={W - 2 * M} height={ROW_PHASE} fill="#f8f7f3" />
              <line x1={M} x2={W - M} y1={ry} y2={ry} stroke={LINE} />
              <rect x={M} y={ry + 8} width={4} height={ROW_PHASE - 16} rx={2} fill={r.color} />
              <text x={M + 14} y={ry + 23} fontSize={14} fontWeight={600} fill={INK}>{clip(label, 31)}</text>
              {r.kind === 'phase' && (
                <>
                  <text x={x0 - 14} y={ry + 23} fontSize={11} fill={MUTED} textAnchor="end">{`${shortDate(r.phase.start_date)} – ${shortDate(r.phase.end_date)}`}</text>
                  <rect x={x(r.phase.start_date)} y={ry + 10} width={Math.max(2, xEnd(r.phase.end_date) - x(r.phase.start_date))} height={16} rx={3} fill={r.color} />
                </>
              )}
            </g>
          )
        }
        const task = r.task
        const done = task.status === 'done'
        const cy = ry + ROW_TASK / 2
        const right = client
          ? (task.is_milestone ? (task.due_date ? formatDate(task.due_date) : '') : task.start_date && task.due_date ? range(task.start_date, task.due_date) : '')
          : initials(task.assignee_id)
        return (
          <g key={i} opacity={done && !client ? 0.55 : 1}>
            <text x={M + 30} y={cy + 4} fontSize={12.5} fill={INK}>{clip(task.title, client ? 34 : 38)}</text>
            <text x={x0 - 14} y={cy + 4} fontSize={11} fill={MUTED} textAnchor="end">{right}</text>
            {task.is_milestone && task.due_date ? (
              <g>
                <rect x={x(task.due_date) + (xEnd(task.due_date) - x(task.due_date)) / 2 - 5.5} y={cy - 5.5} width={11} height={11}
                  fill={INK} transform={`rotate(45 ${x(task.due_date) + (xEnd(task.due_date) - x(task.due_date)) / 2} ${cy})`} />
                <text x={xEnd(task.due_date) + 10} y={cy + 4} fontSize={11} fill={MUTED}>{shortDate(task.due_date)}</text>
              </g>
            ) : (task.start_date || task.due_date) ? (
              <rect x={x(task.start_date ?? task.due_date!)} y={cy - 4}
                width={Math.max(3, xEnd(task.due_date ?? task.start_date!) - x(task.start_date ?? task.due_date!))}
                height={8} rx={2} fill={r.color} opacity={done ? 0.35 : 0.6} />
            ) : null}
          </g>
        )
      })}
      <line x1={M} x2={W - M} y1={rowsBottom} y2={rowsBottom} stroke="#d6d2ca" />

      {showToday && (
        <g>
          <line x1={x(t)} x2={x(t)} y1={axisTop + 22} y2={rowsBottom} stroke={ACCENT} strokeWidth={1.4} strokeDasharray="4 3" />
          <rect x={x(t) - 22} y={axisTop + 4} width={44} height={16} rx={8} fill={ACCENT} />
          <text x={x(t)} y={axisTop + 16} fontSize={10} fontWeight={600} fill="#fff" textAnchor="middle">TODAY</text>
        </g>
      )}

      {!has && <text x={x0 + cw / 2} y={rowsTop + 40} fontSize={14} fill={MUTED} textAnchor="middle">Nothing to show yet.</text>}

      {/* Legend and footer */}
      <g transform={`translate(${M}, ${rowsBottom + 34})`} fontSize={11} fill={MUTED}>
        <rect x={0} y={-9} width={26} height={12} rx={3} fill={phaseColor(2)} />
        <text x={34} y={1}>Phase</text>
        <rect x={86} y={-6} width={26} height={7} rx={2} fill={phaseColor(2)} opacity={0.6} />
        <text x={120} y={1}>{client ? 'Activity' : 'Task'}</text>
        <rect x={172} y={-8} width={9} height={9} fill={INK} transform="rotate(45 176.5 -3.5)" />
        <text x={190} y={1}>Milestone</text>
        {showToday && (
          <>
            <line x1={262} x2={262} y1={-10} y2={4} stroke={ACCENT} strokeWidth={1.4} strokeDasharray="4 3" />
            <text x={272} y={1}>Today</text>
          </>
        )}
        <text x={W - 2 * M} y={1} textAnchor="end">
          {client ? 'Schedule is preliminary and subject to change.' : 'Internal use. Initials show who is assigned.'}
        </text>
      </g>
    </svg>
  )
}
