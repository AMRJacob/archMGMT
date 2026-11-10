import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { addDays, daysBetween, parseISO, shortDate, today, toISO } from '../lib/dates.ts'
import { mondayOf } from '../lib/workload.ts'
import { whoLabel } from '../lib/assignees.ts'
import type { ShownTask } from '../lib/tree.ts'
import type { Person, Phase } from '../lib/types.ts'

type Span = 'all' | '6' | '3'
const SPAN_KEY = 'archmgmt.phoneSpan.v2'

/** Labelled ticks for the axis, at a spacing that never crowds: weeks, months, quarters or years. */
function axisTicks(start: string, end: string, maxLabels: number) {
  const len = daysBetween(start, end) + 1
  const s = parseISO(start)
  const monthsAt = (every: number) => {
    const out: { date: string; label: string; strong: boolean }[] = []
    for (let m = 0; m < 600; m += 1) {
      const d = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + m, 1))
      const iso = toISO(d)
      if (iso > end) break
      if (iso < start || d.getUTCMonth() % every !== 0) continue
      const jan = d.getUTCMonth() === 0
      const mon = d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })
      out.push({ date: iso, label: every === 12 ? String(d.getUTCFullYear()) : jan ? String(d.getUTCFullYear()) : mon, strong: jan })
    }
    return out
  }
  if (len <= 120) {
    // Weeks (Mondays), every one or every other, with the month on the first week of each month.
    const out: { date: string; label: string; strong: boolean }[] = []
    const every = Math.ceil(len / 7 / maxLabels)
    let i = 0
    for (let d = mondayOf(start) < start ? addDays(mondayOf(start), 7) : mondayOf(start); d <= end; d = addDays(d, 7), i++) {
      if (i % every) continue
      const dt = parseISO(d)
      out.push({ date: d, label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }), strong: dt.getUTCDate() <= 7 * every })
    }
    return out
  }
  for (const every of [1, 2, 3, 6, 12]) {
    const t = monthsAt(every)
    if (t.length <= maxLabels) return t
  }
  return monthsAt(12).filter((_, i, a) => i % Math.ceil(a.length / maxLabels) === 0)
}

/**
 * The timeline for phones. Every row is its name on one line and its bar on the next, across the full screen
 * width, with the bar's dates written beside it and the phase's span shaded behind it. Gridlines run down
 * from the dates on the axis. Swipe sideways (or ‹ ›) to move through time; tap a phase to fold it; tap a row
 * to open it.
 */
export default function PhoneTimeline({ phases, rows, people, colorOf, onOpen }: {
  phases: Phase[]
  /** What to show, in tree order, with depth and rolled-up dates (the Detail slider and Show filter applied). */
  rows: ShownTask[]
  people: Person[]
  colorOf: Map<string, string>
  onOpen: (t: ShownTask) => void
}) {
  const [span, setSpan] = useState<Span>(() => { try { return (localStorage.getItem(SPAN_KEY) as Span) || '6' } catch { return '6' } })
  const pickSpan = (s: Span) => { setSpan(s); setFolds({}); try { localStorage.setItem(SPAN_KEY, s) } catch { /* ignore */ } }
  const t0 = today()
  const homeFrom = (s: Span) => addDays(mondayOf(t0), s === '3' ? -14 : -28)
  const [from, setFrom] = useState(() => homeFrom(span))
  // Phases folded or opened by hand; the rest follow the default (folded when nothing in them is on screen).
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const body = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ x: number; y: number; from: string; on: boolean; moved: boolean } | null>(null)
  const suppressTap = useRef(0)

  const order = [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))
  const all = [...order.flatMap((p) => [p.start_date, p.end_date]), ...rows.flatMap((r) => [r.start_date, r.due_date])].filter((d): d is string => Boolean(d)).sort()
  if (!all.length) return <p className="muted ptl-empty">Nothing with dates yet.</p>
  const start = span === 'all' ? all[0] : from
  const end = span === 'all' ? all[all.length - 1] : addDays(start, span === '6' ? 182 : 91)
  const len = Math.max(1, daysBetween(start, end) + 1)
  const at = (d: string) => Math.min(1, Math.max(0, daysBetween(start, d) / len))
  const pct = (f: number) => `${(f * 100).toFixed(3)}%`
  const width = typeof window !== 'undefined' ? window.innerWidth : 390
  const ticks = axisTicks(start, end, Math.max(4, Math.floor((width - 60) / 52)))
  const todayAt = t0 >= start && t0 <= end ? at(t0) : null
  const overlaps = (a: string | null, b: string | null) => { const x = a ?? b, y = b ?? a; return Boolean(x && y && y >= start && x <= end) }

  // Lines down each row: the axis dates, and today.
  const grid = (
    <span className="ptl-grid" aria-hidden="true">
      {ticks.map((k) => <i key={k.date} className={k.strong ? 'strong' : ''} style={{ left: pct(at(k.date)) }} />)}
      {todayAt !== null && <i className="today" style={{ left: pct(todayAt) }} />}
    </span>
  )
  const range = (a: string | null, b: string | null) => {
    if (!a && !b) return ''
    if (!a || !b || a === b) return shortDate(a ?? b)
    const sameMonth = a.slice(0, 7) === b.slice(0, 7)
    return `${shortDate(a)} – ${sameMonth ? String(Number(b.slice(8))) : shortDate(b)}`
  }

  /** The bar (or diamond) on a lane, with its dates written beside it. */
  const lane = (s: string | null, e: string | null, opts: { milestone?: boolean; phase?: Phase | null; kind: 'phase' | 'row' }) => {
    const a = s ?? e, b = e ?? s
    const band = opts.phase && opts.kind === 'row' && overlaps(opts.phase.start_date, opts.phase.end_date)
      ? <i className="ptl-band" style={{ left: pct(at(opts.phase.start_date)), width: pct(at(addDays(opts.phase.end_date, 1)) - at(opts.phase.start_date)) }} />
      : null
    if (!a || !b) return <span className="ptl-lane">{grid}{band}<span className="ptl-note">No dates</span></span>
    const label = range(s, e)
    if (b < start || a > end) {
      return <span className="ptl-lane">{grid}{band}<span className={`ptl-note ${a > end ? 'right' : 'left'}`}>{a > end ? `${label} ›` : `‹ ${label}`}</span></span>
    }
    const l = at(a), r = opts.milestone ? l : at(addDays(b, 1))
    // Dates go after the bar when there's room on the right, otherwise before it.
    const after = r < 0.62
    const text = <span className={`ptl-when ${after ? 'after' : 'before'}`} style={after ? { left: `calc(${pct(r)} + ${opts.milestone ? 9 : 5}px)` } : { right: `calc(${pct(1 - l)} + ${opts.milestone ? 9 : 5}px)` }}>{label}</span>
    return (
      <span className="ptl-lane">
        {grid}{band}
        {opts.milestone
          ? <i className="ptl-dia" style={{ left: pct(l) }} />
          : <i className={`ptl-bar${opts.kind === 'phase' ? ' phase' : ''}${a < start ? ' cut-l' : ''}${b > end ? ' cut-r' : ''}`} style={{ left: pct(l), width: `max(4px, ${pct(r - l)})` }} />}
        {text}
      </span>
    )
  }

  const byPhase = new Map<string | null, ShownTask[]>()
  for (const r of rows) {
    const k = r.phase_id && order.some((p) => p.id === r.phase_id) ? r.phase_id : null
    byPhase.set(k, [...(byPhase.get(k) ?? []), r])
  }

  // Swipe sideways to move through time (zoomed spans); up and down still scrolls the page.
  const onDown = (e: PointerEvent) => { if (span !== 'all' && e.pointerType !== 'mouse') swipe.current = { x: e.clientX, y: e.clientY, from, on: false, moved: false } }
  const onMove = (e: PointerEvent) => {
    const sw = swipe.current
    if (!sw) return
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y
    if (!sw.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; return }
      if (Math.abs(dx) < 12) return
      sw.on = true
    }
    sw.moved = true
    const w = body.current?.getBoundingClientRect().width ?? width
    const days = Math.round((-dx / Math.max(1, w - 26)) * len)
    setFrom(addDays(sw.from, days))
  }
  const onUp = () => { const sw = swipe.current; swipe.current = null; if (sw?.moved) { suppressTap.current = Date.now() } }
  const tapped = (fn: () => void) => () => { if (Date.now() - suppressTap.current > 300) fn() }

  const step = span === '6' ? 56 : 28
  return (
    <div className="ptl">
      <div className="ptl-tools">
        <div className="segmented small-seg" aria-label="Time span">
          {([['3', '3 mo'], ['6', '6 mo'], ['all', 'All']] as [Span, string][]).map(([k, l]) => (
            <button key={k} className={span === k ? 'on' : ''} onClick={() => pickSpan(k)}>{l}</button>
          ))}
        </div>
        {span !== 'all' && (
          <span className="ptl-nav">
            <button className="btn small-btn" aria-label="Earlier" onClick={() => setFrom(addDays(from, -step))}>‹</button>
            <button className="btn small-btn" onClick={() => setFrom(homeFrom(span))}>Today</button>
            <button className="btn small-btn" aria-label="Later" onClick={() => setFrom(addDays(from, step))}>›</button>
          </span>
        )}
      </div>

      <div className="ptl-axis" aria-label={`${shortDate(start)} to ${shortDate(end)}`}>
        <div className="ptl-axis-top">
          <span>{shortDate(start)}, {start.slice(0, 4)}</span>
          {span !== 'all' && <span className="muted">swipe to move</span>}
          <span>{shortDate(end)}, {end.slice(0, 4)}</span>
        </div>
        <div className="ptl-axis-in">
          {ticks.map((k, i) => {
            const x = at(k.date)
            // Labels near the right edge sit to the left of their line so they stay on screen.
            const flip = x > 0.86
            return <span key={k.date} className={`${k.strong ? 'strong' : ''}${flip ? ' flip' : ''}${i === 0 && x < 0.04 ? ' first' : ''}`} style={{ left: pct(x) }}>{k.label}</span>
          })}
          {todayAt !== null && <em style={{ left: pct(todayAt) }} />}
        </div>
      </div>

      <div className="ptl-body" ref={body} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {[...order, null].map((p) => {
          const list = byPhase.get(p?.id ?? null) ?? []
          if (!p && !list.length) return null
          const key = p?.id ?? 'none'
          const color = p ? colorOf.get(p.id) ?? '#999' : '#9a9a9a'
          const visible = list.filter((r) => overlaps(r.start_date, r.due_date))
          const inView = p ? overlaps(p.start_date, p.end_date) || visible.length > 0 : visible.length > 0
          const folded = folds[key] ?? (span !== 'all' && !inView)
          // Zoomed in: rows outside the window are left out (the phase says how many).
          const shown = span === 'all' ? list : visible
          const hidden = list.length - shown.length
          const where = p && span !== 'all' && !inView ? (p.end_date < start ? 'earlier' : 'later') : null
          return (
            <section key={key} className={`ptl-phase${folded ? ' folded' : ''}${where ? ` out ${where}` : ''}`} style={{ '--pc': color } as CSSProperties}>
              <button className="ptl-phead" onClick={tapped(() => setFolds({ ...folds, [key]: !folded }))} aria-expanded={!folded}>
                <span className="ptl-label">
                  <svg className="ptl-chev" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <strong>{p?.name ?? 'No phase'}</strong>
                  <span className="ptl-count">{list.length}{where ? ` · ${where}` : ''}</span>
                </span>
                {p && lane(p.start_date, p.end_date, { kind: 'phase' })}
              </button>
              {!folded && (
                <ul>
                  {shown.map((r) => {
                    const who = whoLabel(r, people)
                    return (
                      <li key={r.id} className={`ptl-row k-${r.kind ?? 'task'}${r.status === 'done' ? ' done' : ''}${r.is_milestone ? ' ms' : ''}`} onClick={tapped(() => onOpen(r))}
                        style={{ '--d': r._depth ?? 0 } as CSSProperties}>
                        <span className="ptl-label">
                          <span className="ptl-name">{r.status === 'done' && <span className="ptl-done">✓</span>}{r.kind === 'sheet' && r.sheet_number ? <span className="mono">{r.sheet_number} </span> : null}{r.title || 'Untitled'}</span>
                          {who && <span className="ptl-who">{who}</span>}
                        </span>
                        {lane(r.start_date, r.due_date, { milestone: r.is_milestone, phase: p, kind: 'row' })}
                      </li>
                    )
                  })}
                  {hidden > 0 && <li className="ptl-more muted small">{hidden} more outside these dates</li>}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
