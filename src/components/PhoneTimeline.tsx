import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { addDays, daysBetween, parseISO, shortDate, today, toISO } from '../lib/dates.ts'
import { mondayOf } from '../lib/workload.ts'
import { whoLabel } from '../lib/assignees.ts'
import type { ShownTask } from '../lib/tree.ts'
import type { Person, Phase } from '../lib/types.ts'

type Span = 'all' | '6' | '3'
const SPAN_KEY = 'archmgmt.phoneSpan.v2'

/** Labelled ticks for the axis, spaced so they never crowd: weeks, months, quarters or years. */
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
      out.push({ date: iso, label: jan ? String(d.getUTCFullYear()) : d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' }), strong: jan })
    }
    return out
  }
  if (len / maxLabels <= 9) {
    // Weeks (Mondays), with the first week of each month in bold.
    const out: { date: string; label: string; strong: boolean }[] = []
    const every = Math.max(1, Math.ceil(len / 7 / maxLabels))
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
  return monthsAt(12)
}

const range = (a: string | null, b: string | null) => {
  if (!a && !b) return ''
  if (!a || !b || a === b) return shortDate(a ?? b)
  return `${shortDate(a)} – ${a.slice(0, 7) === b.slice(0, 7) ? String(Number(b.slice(8))) : shortDate(b)}`
}

/**
 * The timeline for phones, in the style of a sports stats table. At rest each row shows its name, dates and
 * people on the left with the coming weeks beside them. Swipe the timeline sideways (the phone's own smooth
 * scrolling) and the names slide up into a thin line above each bar, so the bars get the whole width; swipe
 * back to the start and they open out again. The date header stays at the top. Tap a row to open it; tap a
 * phase to fold it.
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
  const t0 = today()
  const home = addDays(mondayOf(t0), -14)
  const [anchor, setAnchor] = useState(home)
  const [folds, setFolds] = useState<Record<string, boolean>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const axis = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth - 28 : 360))

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setVw(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Sideways scrolling: the header follows the bars, and leaving the start folds the names up (no re-render).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const on = () => {
      const x = el.scrollLeft
      if (axis.current) axis.current.style.transform = `translateX(${-x}px)`
      wrap.current?.classList.toggle('slid', x > 6)
    }
    on()
    el.addEventListener('scroll', on, { passive: true })
    return () => el.removeEventListener('scroll', on)
  })

  const goTo = (a: string) => { setAnchor(a); scroller.current?.scrollTo({ left: 0 }) }
  const pickSpan = (s: Span) => { setSpan(s); setFolds({}); try { localStorage.setItem(SPAN_KEY, s) } catch { /* ignore */ } goTo(home) }

  const order = [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))
  const dated = [...order.flatMap((p) => [p.start_date, p.end_date]), ...rows.flatMap((r) => [r.start_date, r.due_date])].filter((d): d is string => Boolean(d)).sort()
  if (!dated.length) return <p className="muted ptl-empty">Nothing with dates yet.</p>
  const pFirst = dated[0], pLast = dated[dated.length - 1]

  // Geometry: the name column covers the left at rest; the time shown beside it starts at the anchor.
  const L = Math.round(Math.min(vw * 0.44, 250))
  const days = span === '3' ? 91 : span === '6' ? 182 : Math.max(30, daysBetween(pFirst, pLast) + 1)
  const ppd = span === 'all' ? (vw - L - 24) / days : (vw - 14) / days
  const startAt = span === 'all' ? pFirst : anchor
  const D0 = addDays(startAt, -Math.ceil(L / ppd))
  const Dend = span === 'all' ? addDays(pLast, 3) : addDays(pLast > addDays(anchor, days) ? pLast : addDays(anchor, days), 21)
  const W = span === 'all' ? vw : Math.round((daysBetween(D0, Dend) + 1) * ppd) + 14
  const x = (d: string) => Math.round(daysBetween(D0, d) * ppd)
  const ticks = axisTicks(D0, Dend, Math.max(4, Math.floor(W / 56)))
  const step = Math.round(days / 2)

  const byPhase = new Map<string | null, ShownTask[]>()
  for (const r of rows) {
    const k = r.phase_id && order.some((p) => p.id === r.phase_id) ? r.phase_id : null
    byPhase.set(k, [...(byPhase.get(k) ?? []), r])
  }

  const bar = (s: string | null, e: string | null, milestone: boolean, cls = '') => {
    const a = s ?? e, b = e ?? s
    if (!a || !b) return <span className="ptl-note" style={{ left: L + 6 }}>No dates</span>
    if (b < D0) return <span className="ptl-note" style={{ left: 4 }}>‹ {range(s, e)}</span>
    const l = Math.max(0, x(a)), r = milestone ? l : Math.max(l + 4, x(addDays(b, 1)))
    return (
      <>
        {milestone ? <i className="ptl-dia" style={{ left: l }} /> : <i className={`ptl-bar ${cls}${a < D0 ? ' cut-l' : ''}`} style={{ left: l, width: r - l }} />}
        <span className="ptl-when" style={{ left: r + (milestone ? 10 : 6) }}>{range(s, e)}</span>
      </>
    )
  }

  return (
    <div className="ptl" ref={wrap} style={{ '--L': `${L}px`, '--vw': `${vw}px`, '--W': `${W}px` } as CSSProperties}>
      <div className="ptl-tools">
        <div className="segmented small-seg" aria-label="Time span">
          {([['3', '3 mo'], ['6', '6 mo'], ['all', 'All']] as [Span, string][]).map(([k, l]) => (
            <button key={k} className={span === k ? 'on' : ''} onClick={() => pickSpan(k)}>{l}</button>
          ))}
        </div>
        {span !== 'all' && (
          <span className="ptl-nav">
            <button className="btn small-btn" aria-label="Earlier" onClick={() => goTo(addDays(anchor, -step))}>‹</button>
            <button className="btn small-btn" onClick={() => goTo(home)}>Today</button>
            <button className="btn small-btn" aria-label="Later" onClick={() => goTo(addDays(anchor, step))}>›</button>
          </span>
        )}
      </div>

      {/* The date header: outside the scrolling area so it can stay at the top of the screen; moved in step with it. */}
      <div className="ptl-head">
        <div className="ptl-head-clip">
          <div className="ptl-axis" ref={axis} style={{ width: W }}>
            {ticks.map((k) => <span key={k.date} className={k.strong ? 'strong' : ''} style={{ left: x(k.date) }}>{k.label}</span>)}
            {t0 >= D0 && t0 <= Dend && <em style={{ left: x(t0) }} />}
          </div>
          <div className="ptl-head-name">
            <span>Item</span>
            <span className="muted">swipe for more ›</span>
          </div>
        </div>
      </div>

      <div className="ptl-scroll" ref={scroller}>
        <div className="ptl-canvas" style={{ width: W }}>
          {/* Gridlines and today, down the whole list. */}
          <div className="ptl-lines" aria-hidden="true">
            {ticks.map((k) => <i key={k.date} className={k.strong ? 'strong' : ''} style={{ left: x(k.date) }} />)}
            {t0 >= D0 && t0 <= Dend && <i className="today" style={{ left: x(t0) }} />}
          </div>
          {[...order, null].map((p) => {
            const list = byPhase.get(p?.id ?? null) ?? []
            if (!p && !list.length) return null
            const key = p?.id ?? 'none'
            const color = p ? colorOf.get(p.id) ?? '#999' : '#9a9a9a'
            const past = Boolean(p && span !== 'all' && p.end_date < startAt)
            const folded = folds[key] ?? past
            return (
              <section key={key} className={`ptl-phase${folded ? ' folded' : ''}${past ? ' past' : ''}`} style={{ '--pc': color } as CSSProperties}>
                <div className="ptl-prow" onClick={() => setFolds({ ...folds, [key]: !folded })} role="button" aria-expanded={!folded}>
                  <div className="ptl-pname">
                    <svg className="ptl-chev" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <strong>{p?.name ?? 'No phase'}</strong>
                    <span className="ptl-count">{list.length}{past ? ' · done' : ''}</span>
                  </div>
                  {p && <div className="ptl-lane">{bar(p.start_date, p.end_date, false, 'phase')}</div>}
                </div>
                {!folded && list.map((r) => {
                  const who = whoLabel(r, people)
                  return (
                    <div key={r.id} className={`ptl-row k-${r.kind ?? 'task'}${r.status === 'done' ? ' done' : ''}${r.is_milestone ? ' ms' : ''}`} onClick={() => onOpen(r)}
                      style={{ '--d': r._depth ?? 0 } as CSSProperties}>
                      <div className="ptl-name">
                        <span className="ptl-title">
                          {r.is_milestone && <i className="ptl-dia-sm" />}
                          {r.status === 'done' && <span className="ptl-done">✓</span>}
                          {r.kind === 'sheet' && r.sheet_number ? <span className="mono">{r.sheet_number} </span> : null}{r.title || 'Untitled'}
                        </span>
                        <span className="ptl-meta">{range(r.start_date, r.due_date) || 'No dates'}{who && <b>{who}</b>}</span>
                      </div>
                      <div className="ptl-lane">{bar(r.start_date, r.due_date, r.is_milestone)}</div>
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
