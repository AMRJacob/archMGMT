import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { useTableText } from '../lib/prefs.ts'
import { useNavigate } from 'react-router-dom'
import { useRows } from '../lib/data.ts'
import { useProject } from '../lib/projectContext.ts'
import { projectAccent } from '../lib/colors.ts'
import { buildTree, isWorkLeaf } from '../lib/tree.ts'
import NewProjectFlow from '../components/NewProjectFlow.tsx'
import { Pop } from '../components/TaskChips.tsx'
import { area, money, parseAmount } from '../lib/amount.ts'
import { formatDate, maxDate, minDate, today as todayISO } from '../lib/dates.ts'
import { PROJECT_STATUSES, type Person, type Phase, type Project, type ProjectStatus, type Task } from '../lib/types.ts'

interface Row {
  project: Project
  start: string | null
  end: string | null
  currentPhase: string | null
  pm: string | null
  open: number
  total: number
  costSf: number | null
}

type ColKey = 'number' | 'owner' | 'type' | 'pm' | 'status' | 'phase' | 'schedule' | 'start' | 'end' | 'budget' | 'area' | 'costSf' | 'open'

interface Col {
  key: ColKey
  label: string
  num?: boolean
  /** For sorting (and CSV). */
  value: (r: Row) => string | number | null
  cell: (r: Row) => ReactNode
}

const dash = <span className="muted">—</span>
const statusLabel = (s: string) => PROJECT_STATUSES.find((x) => x.value === s)?.label ?? s

const COLUMNS: Col[] = [
  { key: 'number', label: 'No.', value: (r) => r.project.number, cell: (r) => <span className="mono">{r.project.number ?? '—'}</span> },
  { key: 'owner', label: 'Owner', value: (r) => r.project.client, cell: (r) => r.project.client ?? dash },
  { key: 'type', label: 'Building type', value: (r) => r.project.building_type ?? null, cell: (r) => r.project.building_type ?? dash },
  { key: 'pm', label: 'PM', value: (r) => r.pm, cell: (r) => r.pm ?? dash },
  { key: 'status', label: 'Status', value: (r) => statusLabel(r.project.status), cell: (r) => statusLabel(r.project.status) },
  { key: 'phase', label: 'Current phase', value: (r) => r.currentPhase, cell: (r) => (r.currentPhase ? <span className="chip">{r.currentPhase}</span> : dash) },
  { key: 'schedule', label: 'Schedule', value: (r) => r.start, cell: (r) => <span className="small">{formatDate(r.start)} – {formatDate(r.end)}</span> },
  { key: 'start', label: 'Start', value: (r) => r.start, cell: (r) => <span className="small">{formatDate(r.start)}</span> },
  { key: 'end', label: 'Finish', value: (r) => r.end, cell: (r) => <span className="small">{formatDate(r.end)}</span> },
  { key: 'budget', label: 'Budget', num: true, value: (r) => r.project.budget ?? null, cell: (r) => (r.project.budget != null ? money(r.project.budget) : dash) },
  { key: 'area', label: 'Gross area', num: true, value: (r) => r.project.gross_area ?? null, cell: (r) => (r.project.gross_area != null ? area(r.project.gross_area) : dash) },
  { key: 'costSf', label: 'Cost / SF', num: true, value: (r) => r.costSf, cell: (r) => (r.costSf != null ? money(r.costSf, 2) : dash) },
  { key: 'open', label: 'Open tasks', num: true, value: (r) => r.open, cell: (r) => <>{r.open} <span className="muted">/ {r.total}</span></> },
]
const DEFAULT_COLS: ColKey[] = ['number', 'owner', 'type', 'pm', 'phase', 'schedule', 'budget', 'open']
const COLS_KEY = 'archmgmt:projects-columns'
const WIDTHS_KEY = 'archmgmt:projects-widths'
/** Starting widths when long text is cropped (fixed layout); dragged widths win. */
const CROP_WIDTHS: Record<string, number> = {
  name: 250, number: 100, owner: 180, type: 150, pm: 150, status: 100, phase: 170, schedule: 210,
  start: 110, end: 110, budget: 120, area: 110, costSf: 100, open: 100,
}

function savedWidths(): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(WIDTHS_KEY) ?? 'null'); if (v && typeof v === 'object') return v as Record<string, number> } catch { /* storage unavailable */ }
  return {}
}

function savedCols(): ColKey[] {
  try {
    const v = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null') as ColKey[] | null
    if (Array.isArray(v)) return v.filter((k) => COLUMNS.some((c) => c.key === k))
  } catch { /* storage unavailable */ }
  return DEFAULT_COLS
}

export default function Projects() {
  const navigate = useNavigate()
  const projects = useProject()
  const phases = useRows<Phase>('phases')
  const tasks = useRows<Task>('tasks')
  const people = useRows<Person>('people')
  const [status, setStatus] = useState<ProjectStatus | 'all' | 'archived'>('active')
  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [pms, setPms] = useState<string[]>([])
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [cols, setColsState] = useState<ColKey[]>(savedCols)
  const [sort, setSort] = useState<{ key: ColKey | 'name'; dir: 1 | -1 }>({ key: 'number', dir: -1 })
  const [creating, setCreating] = useState(false)
  const [widths, setWidthsState] = useState<Record<string, number>>(savedWidths)
  const [dragCol, setDragCol] = useState<ColKey | null>(null)
  const [dropAt, setDropAt] = useState<{ key: ColKey; side: 'l' | 'r' } | null>(null)
  const resizing = useRef(false)
  const tableText = useTableText()

  const setWidths = (next: Record<string, number>) => {
    setWidthsState(next)
    try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }
  /** Drag a column's right edge to resize it. */
  const startResize = (key: string) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault(); e.stopPropagation()
    resizing.current = true
    const th = (e.currentTarget as HTMLElement).closest('th')!
    const x0 = e.clientX, w0 = th.getBoundingClientRect().width
    let w = w0
    const move = (ev: PointerEvent) => { w = Math.max(60, Math.round(w0 + ev.clientX - x0)); setWidthsState((ws) => ({ ...ws, [key]: w })) }
    const up = () => {
      window.removeEventListener('pointermove', move)
      resizing.current = false
      setWidths({ ...savedWidths(), ...widths, [key]: w })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up, { once: true })
  }
  /** Drop a dragged column header next to another one. */
  const moveCol = (from: ColKey, to: ColKey, side: 'l' | 'r') => {
    if (from === to) return
    const order = cols.filter((k) => k !== from)
    const i = order.indexOf(to) + (side === 'r' ? 1 : 0)
    setCols([...order.slice(0, i), from, ...order.slice(i)])
  }

  const setCols = (next: ColKey[]) => {
    setColsState(next)
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
  }

  const all: Row[] = useMemo(() => {
    const today = todayISO()
    const tree = buildTree(tasks.rows)
    return projects.projects.map((p) => {
      const ph = phases.rows.filter((x) => x.project_id === p.id)
      const current = ph.filter((x) => x.start_date <= today && today <= x.end_date) // overlapping phases can both be current
      const ts = tasks.rows.filter((t) => t.project_id === p.id && !t.is_milestone && isWorkLeaf(tree, t))
      return {
        project: p,
        start: minDate(ph.map((x) => x.start_date)),
        end: maxDate(ph.map((x) => x.end_date)),
        currentPhase: current.length ? current.map((x) => x.name).join(' + ') : null,
        pm: people.rows.find((x) => x.id === p.pm_id)?.name ?? null,
        open: ts.filter((t) => t.status !== 'done').length,
        total: ts.length,
        costSf: p.budget && p.gross_area ? p.budget / p.gross_area : null,
      }
    })
  }, [projects.projects, phases.rows, tasks.rows, people.rows])

  // Filter choices come from what's actually on projects.
  const typeChoices = [...new Set(all.map((r) => r.project.building_type).filter((t): t is string => Boolean(t)))].sort()
  const pmChoices = [...new Set(all.map((r) => r.pm).filter((t): t is string => Boolean(t)))].sort()
  const min = parseAmount(budgetMin), max = parseAmount(budgetMax)
  const minN = typeof min === 'number' ? min : null, maxN = typeof max === 'number' ? max : null

  const q = search.trim().toLowerCase()
  const filtered = all.filter((r) => {
    const p = r.project
    if (status === 'archived' ? !p.archived_at : p.archived_at) return false
    if (status !== 'all' && status !== 'archived' && p.status !== status) return false
    if (q && ![p.name, p.number, p.client, p.building_type, r.pm].some((v) => (v ?? '').toLowerCase().includes(q))) return false
    if (types.length && !types.includes(p.building_type ?? '')) return false
    if (pms.length && !pms.includes(r.pm ?? '')) return false
    if (minN !== null && (p.budget ?? -1) < minN) return false
    if (maxN !== null && (p.budget == null || p.budget > maxN)) return false
    return true
  })
  const sortVal = (r: Row) => (sort.key === 'name' ? r.project.name : COLUMNS.find((c) => c.key === sort.key)!.value(r))
  const rows = [...filtered].sort((a, b) => {
    const va = sortVal(a), vb = sortVal(b)
    if (va == null && vb == null) return a.project.name.localeCompare(b.project.name)
    if (va == null) return 1 // empties last either way
    if (vb == null) return -1
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })
    return c * sort.dir || a.project.name.localeCompare(b.project.name)
  })

  const shownCols = cols.map((k) => COLUMNS.find((c) => c.key === k)).filter((c): c is Col => Boolean(c)) // in the order you arranged them
  const filtersOn = Boolean(q || types.length || pms.length || minN !== null || maxN !== null)
  const clear = () => { setSearch(''); setTypes([]); setPms([]); setBudgetMin(''); setBudgetMax('') }
  const sumOf = (f: (p: Project) => number | null | undefined) => rows.reduce((s, r) => s + (f(r.project) ?? 0), 0)
  const totals: Partial<Record<ColKey, string>> = {
    budget: sumOf((p) => p.budget) ? money(sumOf((p) => p.budget)) : '',
    area: sumOf((p) => p.gross_area) ? area(sumOf((p) => p.gross_area)) : '',
    open: String(rows.reduce((s, r) => s + r.open, 0)),
  }
  const showTotals = rows.length > 1 && shownCols.some((c) => c.key in totals)

  const header = (key: ColKey | 'name', label: string, num = false) => {
    const movable = key !== 'name'
    return (
      <th key={key} className={`${num ? 'num' : ''}${dragCol === key ? ' col-dragging' : ''}${dropAt?.key === key ? ` col-drop-${dropAt.side}` : ''}`}
        aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
        draggable={movable}
        title={movable ? 'Click to sort · drag to move · drag the edge to resize' : 'Click to sort · drag the edge to resize'}
        onDragStart={(e) => {
          if (!movable || resizing.current) { e.preventDefault(); return }
          setDragCol(key as ColKey); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', label)
        }}
        onDragOver={(e) => {
          if (!dragCol || !movable) return
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          const side = e.clientX < r.left + r.width / 2 ? 'l' : 'r'
          if (dropAt?.key !== key || dropAt.side !== side) setDropAt({ key: key as ColKey, side })
        }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null) }}
        onDrop={(e) => {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          if (dragCol && movable) moveCol(dragCol, key as ColKey, e.clientX < r.left + r.width / 2 ? 'l' : 'r')
          setDragCol(null); setDropAt(null)
        }}
        onDragEnd={() => { setDragCol(null); setDropAt(null) }}>
        {/* A span, not a button: browsers won't start dragging a header from a button. */}
        <span role="button" tabIndex={0} className={`th-sort${sort.key === key ? ' on' : ''}`}
          onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: num ? -1 : 1 }))}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.currentTarget as HTMLElement).click() } }}>
          {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
        </span>
        <span className="col-resize" onPointerDown={startResize(key)} onDoubleClick={() => { const { [key]: _drop, ...rest } = widths; void _drop; setWidths(rest) }}
          title="Drag to resize · double-click to reset" />
      </th>
    )
  }

  function exportCsv() {
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const head = ['Project', ...shownCols.map((c) => c.label)]
    const lines = rows.map((r) => [r.project.name, ...shownCols.map((c) => (c.key === 'schedule' ? `${r.start ?? ''} – ${r.end ?? ''}` : c.key === 'costSf' && r.costSf != null ? r.costSf.toFixed(2) : c.value(r)))])
    const csv = [head, ...lines].map((l) => l.map(esc).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `projects ${todayISO()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const error = projects.error ?? phases.error ?? tasks.error ?? people.error
  const multi = (label: string, choices: string[], picked: string[], set: (v: string[]) => void, empty: string) => (
    <Pop className="filter-pop" title={`Filter by ${label.toLowerCase()}`}
      label={<span className={`filter-chip${picked.length ? ' on' : ''}`}>{picked.length ? `${label}: ${picked.length === 1 ? picked[0] : picked.length}` : label} ▾</span>}>
      {() => (
        <>
          {choices.length === 0 && <div className="pm-item muted">{empty}</div>}
          {choices.map((c) => (
            <label key={c} className="pm-item check">
              <input type="checkbox" checked={picked.includes(c)} onChange={() => set(picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c])} />
              {c}
            </label>
          ))}
          {picked.length > 0 && <><div className="pm-sep" /><button className="pm-item muted" onClick={() => set([])}>Clear</button></>}
        </>
      )}
    </Pop>
  )

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>All Projects</h1>
          <p className="muted">Every project at a glance. Filter, sort by any column, and pick the columns you want.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ New project</button>
      </header>

      <div className="tabs">
        {[{ value: 'all', label: 'All' }, ...PROJECT_STATUSES, { value: 'archived', label: 'Archived' }].map((s) => {
          const live = projects.projects.filter((p) => !p.archived_at)
          const n = s.value === 'all' ? live.length : s.value === 'archived' ? projects.projects.length - live.length : live.filter((p) => p.status === s.value).length
          if (s.value === 'archived' && n === 0) return null
          return (
            <button key={s.value} className={`${status === s.value ? 'tab active' : 'tab'}${s.value === 'archived' ? ' tab-archived' : ''}`}
              onClick={() => setStatus(s.value as ProjectStatus | 'all' | 'archived')}>
              {s.label}
              <span className="count">{n}</span>
            </button>
          )
        })}
      </div>

      <div className="list-filters">
        <input className="field boxed search" type="search" placeholder="Search name, number, owner…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {multi('Building type', typeChoices, types, setTypes, 'No building types set yet')}
        {multi('PM', pmChoices, pms, setPms, 'No PMs set yet')}
        <Pop className="filter-pop" title="Filter by budget"
          label={<span className={`filter-chip${minN !== null || maxN !== null ? ' on' : ''}`}>
            {minN !== null || maxN !== null ? `Budget: ${minN !== null ? money(minN) : 'any'} – ${maxN !== null ? money(maxN) : 'any'}` : 'Budget'} ▾
          </span>}>
          {() => (
            <div className="budget-range">
              <label>At least<input className="field boxed" placeholder="e.g. 1m" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} /></label>
              <label>At most<input className="field boxed" placeholder="e.g. 10m" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} /></label>
            </div>
          )}
        </Pop>
        {filtersOn && <button className="linkbtn" onClick={clear}>Clear filters</button>}
        <span className="grow" />
        <span className="muted small">{rows.length} of {projects.projects.filter((p) => !p.archived_at).length}</span>
        <Pop className="filter-pop" align="right" title="Choose columns" label={<span className="filter-chip">Columns ▾</span>}>
          {() => (
            <>
              <div className="pm-label">Show columns</div>
              {COLUMNS.map((c) => (
                <label key={c.key} className="pm-item check">
                  <input type="checkbox" checked={cols.includes(c.key)}
                    onChange={() => setCols(cols.includes(c.key) ? cols.filter((k) => k !== c.key) : [...cols, c.key])} />
                  {c.label}
                </label>
              ))}
              <div className="pm-sep" />
              <button className="pm-item muted" onClick={() => setCols(DEFAULT_COLS)}>Reset to default</button>
            </>
          )}
        </Pop>
        <button className="btn ghost small-btn" onClick={exportCsv} title="Download these rows and columns as a spreadsheet (CSV)">Export CSV</button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card table-scroll">
        <table className={`table clickable${tableText === 'crop' ? ' crop' : ''}`}>
          <colgroup>
            {['name', ...shownCols.map((c) => c.key)].map((k) => {
              const w = widths[k] ?? (tableText === 'crop' ? CROP_WIDTHS[k] : undefined)
              return <col key={k} style={w ? { width: w } : undefined} />
            })}
          </colgroup>
          <thead>
            <tr>
              {header('name', 'Project')}
              {shownCols.map((c) => header(c.key, c.label, c.num))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.project.id} className={r.project.id === projects.current?.id ? 'current' : ''}
                onClick={() => { projects.select(r.project.id); navigate('/overview') }}>
                <td title={tableText === 'crop' ? [r.project.name, r.project.client].filter(Boolean).join(' · ') : undefined}>
                  <div className="strong"><span className="pdot" style={{ background: projectAccent(r.project.color).accent }} />{r.project.name}</div>
                  {!cols.includes('owner') && r.project.client && <div className="muted small">{r.project.client}</div>}
                </td>
                {shownCols.map((c) => {
                  const v = c.key === 'schedule' ? `${formatDate(r.start)} – ${formatDate(r.end)}` : c.value(r)
                  return <td key={c.key} className={c.num ? 'num' : ''} title={tableText === 'crop' && v != null && typeof v === 'string' ? v : undefined}>{c.cell(r)}</td>
                })}
              </tr>
            ))}
            {!projects.loading && rows.length === 0 && (
              <tr><td colSpan={shownCols.length + 1} className="empty">{filtersOn ? 'No projects match these filters.' : 'No projects here yet.'}</td></tr>
            )}
          </tbody>
          {showTotals && (
            <tfoot>
              <tr>
                <td className="muted small">Total of {rows.length}</td>
                {shownCols.map((c) => <td key={c.key} className={c.num ? 'num strong' : ''}>{totals[c.key] ?? ''}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {creating && <NewProjectFlow onClose={() => setCreating(false)} />}
    </section>
  )
}
