import { useState, type CSSProperties } from 'react'
import { addDays, daysBetween, parseISO, shortDate, today, toISO } from '../lib/dates.ts'
import { mondayOf } from '../lib/workload.ts'
import { whoLabel } from '../lib/assignees.ts'
import type { ShownTask } from '../lib/tree.ts'
import type { Person, Phase } from '../lib/types.ts'

type Span = 'all' | '6' | '3'

/**
 * The timeline for phones: each row is its name on one line and its bar on the next, so the bars get the
 * whole screen width (no label column). Phases head their rows. Tap a row to open it.
 */
export default function PhoneTimeline({ phases, rows, people, colorOf, onOpen }: {
  phases: Phase[]
  /** What to show, in tree order, with depth and rolled-up dates (the Detail slider and Show filter applied). */
  rows: ShownTask[]
  people: Person[]
  colorOf: Map<string, string>
  onOpen: (t: ShownTask) => void
}) {
  const [span, setSpan] = useState<Span>(() => { try { return (localStorage.getItem('archmgmt.phoneSpan') as Span) || 'all' } catch { return 'all' } })
  const pick = (s: Span) => { setSpan(s); try { localStorage.setItem('archmgmt.phoneSpan', s) } catch { /* ignore */ } }
  const t0 = today()
  const [from, setFrom] = useState(() => addDays(mondayOf(t0), -14))
  const order = [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))
  const all = [...order.flatMap((p) => [p.start_date, p.end_date]), ...rows.flatMap((r) => [r.start_date, r.due_date])].filter((d): d is string => Boolean(d)).sort()
  if (!all.length) return <p className="muted ptl-empty">No dates yet.</p>
  const months = span === '6' ? 6 : 3
  const start = span === 'all' ? all[0] : from
  const end = span === 'all' ? all[all.length - 1] : addDays(start, Math.round(months * 30.4))
  const len = Math.max(1, daysBetween(start, end) + 1)
  const pos = (d: string) => Math.min(1, Math.max(0, daysBetween(start, d) / len))
  const bar = (s: string | null, e: string | null) => {
    const a = s ?? e, b = e ?? s
    if (!a || !b) return null
    if (b < start || a > end) return { off: a > end ? 'right' : 'left' } as const
    const l = pos(a), r = pos(addDays(b, 1))
    return { left: l, width: Math.max(0.006, r - l), cutL: a < start, cutR: b > end }
  }

  // Month (or year) ticks along the top.
  const ticks: { at: number; label: string; year: boolean }[] = []
  const first = parseISO(start)
  for (let m = 0; m < 400; m++) {
    const d = toISO(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + m, 1)))
    if (d > end) break
    if (d < start) continue
    const dt = parseISO(d)
    const year = dt.getUTCMonth() === 0
    const label = len > 500 ? (year ? String(dt.getUTCFullYear()) : dt.toLocaleDateString(undefined, { month: 'narrow', timeZone: 'UTC' }))
      : dt.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }) + (year ? ` ${String(dt.getUTCFullYear()).slice(2)}` : '')
    ticks.push({ at: pos(d), label, year })
  }
  const todayAt = t0 >= start && t0 <= end ? pos(t0) : null
  const step = span === '6' ? 56 : 28
  const pct = (f: number) => `${(f * 100).toFixed(3)}%`

  const byPhase = new Map<string | null, ShownTask[]>()
  for (const r of rows) {
    const k = r.phase_id && order.some((p) => p.id === r.phase_id) ? r.phase_id : null
    byPhase.set(k, [...(byPhase.get(k) ?? []), r])
  }

  const row = (r: ShownTask, color: string) => {
    const b = bar(r.start_date, r.due_date)
    const who = whoLabel(r, people)
    const depth = r._depth ?? 0
    return (
      <li key={r.id} className={`ptl-row k-${r.kind ?? 'task'}${r.status === 'done' ? ' done' : ''}`} onClick={() => onOpen(r)}
        style={{ '--pc': color, '--d': depth } as CSSProperties}>
        <div className="ptl-label">
          <span className="ptl-name">{r.is_milestone && <i className="ptl-dia-sm" />}{r.kind === 'sheet' && r.sheet_number ? <span className="mono">{r.sheet_number} </span> : null}{r.title || 'Untitled'}</span>
          <span className="ptl-meta">{r.is_milestone ? shortDate(r.due_date) : r.start_date && r.due_date && r.start_date !== r.due_date ? `${shortDate(r.start_date)} – ${shortDate(r.due_date)}` : shortDate(r.due_date ?? r.start_date)}{who && <b>{who}</b>}</span>
        </div>
        <div className="ptl-track">
          {b && 'off' in b ? <span className={`ptl-off ${b.off}`}>{b.off === 'right' ? 'later ›' : '‹ earlier'}</span>
            : b && r.is_milestone ? <i className="ptl-dia" style={{ left: pct(b.left) }} />
            : b ? <i className={`ptl-bar${b.cutL ? ' cut-l' : ''}${b.cutR ? ' cut-r' : ''}`} style={{ left: pct(b.left), width: pct(b.width) }} />
            : <span className="ptl-off">no dates</span>}
        </div>
      </li>
    )
  }

  return (
    <div className="ptl">
      <div className="ptl-tools">
        <div className="segmented small-seg" aria-label="Time span">
          {([['all', 'Whole project'], ['6', '6 months'], ['3', '3 months']] as [Span, string][]).map(([k, l]) => (
            <button key={k} className={span === k ? 'on' : ''} onClick={() => pick(k)}>{l}</button>
          ))}
        </div>
        {span !== 'all' && (
          <span className="ptl-nav">
            <button className="btn small-btn" aria-label="Earlier" onClick={() => setFrom(addDays(from, -step))}>‹</button>
            <button className="btn small-btn" onClick={() => setFrom(addDays(mondayOf(t0), -14))}>Today</button>
            <button className="btn small-btn" aria-label="Later" onClick={() => setFrom(addDays(from, step))}>›</button>
          </span>
        )}
      </div>
      <div className="ptl-axis">
        <div className="ptl-axis-in">
          {ticks.map((k) => <span key={k.at} className={k.year ? 'yr' : ''} style={{ left: pct(k.at) }}>{k.label}</span>)}
          {todayAt !== null && <em style={{ left: pct(todayAt) }}>Today</em>}
        </div>
        <div className="ptl-range muted small">{shortDate(start)} – {shortDate(end)}</div>
      </div>
      <div className="ptl-body">
        {todayAt !== null && <div className="ptl-today" style={{ '--at': todayAt } as CSSProperties} />}
        {[...order, null].map((p) => {
          // Zoomed in: leave out what falls outside the window, so there's less to scroll past.
          const inView = (r: ShownTask) => { const b = bar(r.start_date, r.due_date); return !b || !('off' in b) }
          const list = (byPhase.get(p?.id ?? null) ?? []).filter((r) => span === 'all' || inView(r))
          if (!p && !list.length) return null
          if (p && span !== 'all' && !list.length && p.end_date < start) return null
          if (p && span !== 'all' && !list.length && p.start_date > end) return null
          const color = p ? colorOf.get(p.id) ?? '#999' : '#9a9a9a'
          const pb = p ? bar(p.start_date, p.end_date) : null
          return (
            <section key={p?.id ?? 'none'} className="ptl-phase" style={{ '--pc': color } as CSSProperties}>
              <div className="ptl-phead">
                <div className="ptl-label"><strong>{p?.name ?? 'No phase'}</strong>{p && <span className="ptl-meta">{shortDate(p.start_date)} – {shortDate(p.end_date)}</span>}</div>
                <div className="ptl-track">
                  {pb && 'off' in pb ? <span className={`ptl-off ${pb.off}`}>{pb.off === 'right' ? 'later ›' : '‹ earlier'}</span>
                    : pb ? <i className="ptl-bar phase" style={{ left: pct(pb.left), width: pct(pb.width) }} /> : null}
                </div>
              </div>
              {list.length > 0 && <ul>{list.map((r) => row(r, color))}</ul>}
            </section>
          )
        })}
      </div>
    </div>
  )
}
