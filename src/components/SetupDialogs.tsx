import { useState } from 'react'
import Modal from './Modal.tsx'
import { addDays, daysBetween, formatDate, nextMonday, shortDate } from '../lib/dates.ts'
import { ROOT_PRESETS } from '../lib/colors.ts'
import { BUILDING_TYPES, parseAmount } from '../lib/amount.ts'
import { milestoneType } from '../lib/milestones.ts'
import { PHASE_TEMPLATES, templateFor, type TemplateTask } from '../lib/phaseTemplates.ts'
import { nextSheetNumbers, SHEET_TYPES, sheetRows, sheetTypeById } from '../lib/sheetTypes.ts'
import { DEFAULT_PHASES, type Phase, type Project, type Task } from '../lib/types.ts'

// ---------- new project ----------

const num = (v: string) => { const n = parseAmount(v); return n === 'bad' ? null : n }

type DraftPhase = { key: string; name: string; weeks: number; on: boolean; alongside?: string }

/** Phases offered but not ticked by default. `alongside` runs it in parallel with another phase instead of after it. */
const OPTIONAL_PHASES: { name: string; weeks: number; after: string; alongside?: string }[] = [
  { name: 'FF&E', weeks: 16, after: 'Construction Documents', alongside: 'Construction Documents' },
]

function startingPhases(): DraftPhase[] {
  const out: DraftPhase[] = DEFAULT_PHASES.map((p, i) => ({ key: String(i), name: p.name, weeks: p.weeks, on: true }))
  for (const o of OPTIONAL_PHASES) {
    const i = out.findIndex((p) => p.name === o.after)
    out.splice(i < 0 ? out.length : i + 1, 0, { key: `opt-${o.name}`, name: o.name, weeks: o.weeks, on: false, alongside: o.alongside })
  }
  return out
}

/**
 * Start a project: name it, pick its phases and their lengths. Only overall phase dates are needed to
 * sketch the schedule; the work inside each phase is set up when you get to it.
 */
export function NewProjectDialog({ onCreate, onClose }: {
  onCreate: (project: Partial<Project>, phases: Partial<Phase>[], setupFirst: boolean) => Promise<void>
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [client, setClient] = useState('')
  const [buildingType, setBuildingType] = useState('')
  const [grossArea, setGrossArea] = useState('')
  const [budget, setBudget] = useState('')
  const [color, setColor] = useState(ROOT_PRESETS[0]?.hex ?? '#4d8a86')
  const [start, setStart] = useState(nextMonday())
  const [phases, setPhases] = useState<DraftPhase[]>(startingPhases)
  const [setupFirst, setSetupFirst] = useState(true)
  const [busy, setBusy] = useState(false)

  const chosen = phases.filter((p) => p.on && p.name.trim())
  const dated = new Map<string, { s: string; e: string }>()
  chosen.reduce((from, p) => {
    // A phase that runs alongside another starts with it and doesn't push later phases back.
    const with_ = p.alongside ? chosen.find((x) => x.name === p.alongside && !x.alongside) : undefined
    const s = with_ ? dated.get(with_.key)?.s ?? from : from
    const e = addDays(s, Math.max(1, p.weeks) * 7 - 1)
    dated.set(p.key, { s, e })
    return with_ ? from : addDays(e, 1)
  }, start)
  const finish = chosen.length ? [...dated.values()].map((d) => d.e).sort().pop()! : null
  const set = (key: string, c: Partial<DraftPhase>) => setPhases((ps) => ps.map((p) => (p.key === key ? { ...p, ...c } : p)))

  async function create() {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      await onCreate(
        {
          name: name.trim(), number: number.trim() || null, client: client.trim() || null, color, color_scheme: 'balanced', status: 'active',
          building_type: buildingType || null, gross_area: num(grossArea), budget: num(budget),
        },
        chosen.map((p, i) => ({ name: p.name.trim(), sort_order: i, start_date: dated.get(p.key)!.s, end_date: dated.get(p.key)!.e, client_visible: true })),
        setupFirst && chosen.length > 0,
      )
    } finally { setBusy(false) }
  }

  return (
    <Modal title="New project" onClose={onClose}
      footer={
        <>
          {chosen.length > 0 && (
            <label className="inline-check grow">
              <input type="checkbox" checked={setupFirst} onChange={(e) => setSetupFirst(e.target.checked)} />
              Set up {chosen[0].name} next
            </label>
          )}
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!name.trim() || busy} onClick={create}>Create project</button>
        </>
      }>
      <div className="setup" onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'checkbox') { e.preventDefault(); void create() } }}>
        <div className="form-grid np-grid">
          <label className="span2">Project name<input className="field boxed" autoFocus value={name} placeholder="e.g. Riverside Branch Library" onChange={(e) => setName(e.target.value)} /></label>
          <label>Number<input className="field boxed mono" value={number} placeholder="2026-014" onChange={(e) => setNumber(e.target.value)} /></label>
          <label>Owner<input className="field boxed" value={client} placeholder="Owner or agency" onChange={(e) => setClient(e.target.value)} /></label>
          <label>Building type
            <input className="field boxed" list="building-types" value={buildingType} placeholder="Choose or type" onChange={(e) => setBuildingType(e.target.value)} />
            <datalist id="building-types">{BUILDING_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
          <div className="np-pair">
            <label>Gross area (SF)<input className="field boxed" inputMode="decimal" value={grossArea} placeholder="12,500" onChange={(e) => setGrossArea(e.target.value)} /></label>
            <label>Budget<input className="field boxed" inputMode="decimal" value={budget} placeholder="$4.25m" onChange={(e) => setBudget(e.target.value)} /></label>
          </div>
        </div>
        <div className="np-colors" role="radiogroup" aria-label="Project colour">
          {ROOT_PRESETS.slice(0, 10).map((c) => (
            <button key={c.hex} type="button" role="radio" aria-checked={c.hex === color} title={c.name}
              className={`np-swatch${c.hex === color ? ' on' : ''}`} style={{ background: c.hex }} onClick={() => setColor(c.hex)} />
          ))}
        </div>

        <div className="setup-head">
          <strong>Phases</strong>
          <span className="muted small">Untick any this project doesn’t have. Lengths just sketch the schedule; drag them later.</span>
        </div>
        <div className="np-start">
          <label>Starts<input type="date" className="field boxed" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} /></label>
          {finish && <span className="muted small">Finishes about <strong>{formatDate(finish)}</strong> · {Math.round(daysBetween(start, finish) / 30.4)} months</span>}
        </div>
        <ul className="np-phases">
          {phases.map((p) => {
            const d = dated.get(p.key)
            return (
              <li key={p.key} className={p.on ? '' : 'off'}>
                <input type="checkbox" checked={p.on} aria-label={`Include ${p.name}`} onChange={(e) => set(p.key, { on: e.target.checked })} />
                <input className="field np-name" value={p.name} onChange={(e) => set(p.key, { name: e.target.value })} />
                <span className="np-weeks">
                  <input type="number" min={1} max={260} className="field boxed" value={p.weeks} disabled={!p.on}
                    onChange={(e) => set(p.key, { weeks: Math.max(1, Math.min(260, Number(e.target.value) || 1)) })} />
                  <span className="muted small">weeks</span>
                </span>
                <span className="muted small np-dates">{d ? `${shortDate(d.s)} – ${shortDate(d.e)}` : p.alongside ? `alongside ${p.alongside}` : ''}</span>
              </li>
            )
          })}
        </ul>
        <button className="btn ghost small-btn" onClick={() => setPhases((ps) => [...ps, { key: crypto.randomUUID(), name: 'New phase', weeks: 4, on: true }])}>+ Another phase</button>
      </div>
    </Modal>
  )
}

// ---------- phase setup ----------

type TaskPick = TemplateTask & { key: string }
type SheetPick = { type: string; count: number; on: boolean }

/** Where a template task lands in a phase: fractions of its length → dates. */
function datesIn(phase: Phase, at: [number, number], milestone: boolean) {
  const len = Math.max(0, daysBetween(phase.start_date, phase.end_date))
  const s = addDays(phase.start_date, Math.round(len * at[0]))
  const e = addDays(phase.start_date, Math.round(len * at[1]))
  return milestone ? { start_date: null, due_date: e } : { start_date: s, due_date: e < s ? s : e }
}

/**
 * Fill a phase in one go: tick the usual tasks, milestones and sheets for it (suggestions follow the
 * AIA phase scopes), adjust counts, add your own. Everything can be changed or removed afterwards.
 */
export function PhaseSetupDialog({ phase, projectId, takenNumbers, startOrder, onCreate, onClose }: {
  phase: Phase
  projectId: string
  takenNumbers: Set<string>
  startOrder: number
  onCreate: (rows: Partial<Task>[]) => Promise<void>
  onClose: () => void
}) {
  const [templateKey, setTemplateKey] = useState(() => templateFor(phase.name)?.key ?? '')
  const tpl = PHASE_TEMPLATES.find((t) => t.key === templateKey) ?? null
  const [tasks, setTasks] = useState<TaskPick[]>(() => (tpl?.tasks ?? []).map((t, i) => ({ ...t, key: `t${i}` })))
  const [sheets, setSheets] = useState<SheetPick[]>(() => sheetPicks(tpl?.sheets ?? []))
  const [moreSheets, setMoreSheets] = useState(false)
  const [own, setOwn] = useState('')
  const [autoNumber, setAutoNumber] = useState(true)
  const [busy, setBusy] = useState(false)

  function applyTemplate(key: string) {
    const t = PHASE_TEMPLATES.find((x) => x.key === key) ?? null
    setTemplateKey(key)
    setTasks((t?.tasks ?? []).map((x, i) => ({ ...x, key: `t${i}` })))
    setSheets(sheetPicks(t?.sheets ?? []))
  }

  const pickedTasks = tasks.filter((t) => t.on)
  const pickedSheets = sheets.filter((s) => s.on && s.count > 0)
  const sheetCount = pickedSheets.reduce((n, s) => n + s.count, 0)
  const shownSheets = moreSheets ? sheets : sheets.filter((s) => s.on || (tpl?.sheets ?? []).some((x) => x.type === s.type))

  function addOwn() {
    const title = own.trim()
    if (!title) return
    setTasks((ts) => [...ts, { key: crypto.randomUUID(), title, at: [0, 1], on: true }])
    setOwn('')
  }

  async function create() {
    setBusy(true)
    try {
      const rows: Partial<Task>[] = []
      let order = startOrder
      for (const t of pickedTasks) {
        const taskId = crypto.randomUUID()
        rows.push({
          id: taskId, project_id: projectId, phase_id: phase.id, parent_id: null, kind: 'task', title: t.title,
          ...datesIn(phase, t.at, Boolean(t.milestone)),
          effort: t.milestone ? null : t.effort ?? 2, status: 'todo', is_milestone: Boolean(t.milestone),
          milestone_type: t.milestone ? t.mtype ?? null : null, client_visible: Boolean(t.milestone),
          assignee_id: null, assignee_ids: [], estimated_hours: null, sort_order: order++,
        })
        ;(t.checklist ?? []).forEach((c, i) => rows.push({
          project_id: projectId, phase_id: phase.id, parent_id: taskId, kind: 'item', title: c, status: 'todo',
          is_milestone: false, client_visible: false, sort_order: i, effort: null, start_date: null, due_date: null,
          assignee_id: null, assignee_ids: [],
        }))
      }
      const taken = new Set(takenNumbers)
      for (const s of pickedSheets) {
        const st = sheetTypeById(s.type)
        if (!st) continue
        const numbers = autoNumber && st.series ? nextSheetNumbers(st.series, s.count, taken) : []
        for (let i = 0; i < s.count; i++) {
          const { sheet, items } = sheetRows({
            projectId, phaseId: phase.id, number: numbers[i] ?? '', name: s.count > 1 ? `${st.name} ${i + 1}` : st.name,
            typeId: st.id, start: phase.start_date, due: phase.end_date, assigneeId: null, sortOrder: order++,
          })
          rows.push(sheet, ...items)
        }
      }
      if (rows.length) await onCreate(rows)
      onClose()
    } finally { setBusy(false) }
  }

  const total = pickedTasks.length + sheetCount
  return (
    <Modal title={`Set up ${phase.name}`} onClose={onClose} size="wide"
      footer={
        <>
          <span className="muted small grow">Everything can be changed, moved or removed later.</span>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!total || busy} onClick={create}>
            {total ? `Add ${[pickedTasks.length && `${pickedTasks.length} task${pickedTasks.length === 1 ? '' : 's'}`, sheetCount && `${sheetCount} sheet${sheetCount === 1 ? '' : 's'}`].filter(Boolean).join(' and ')}` : 'Add'}
          </button>
        </>
      }>
      <div className="setup wide">
        <div className="setup-sub">
          <span className="muted">{shortDate(phase.start_date)} – {shortDate(phase.end_date)}{tpl ? ` · ${tpl.blurb}` : ''}</span>
          <select className="field boxed setup-tpl" value={templateKey} onChange={(e) => applyTemplate(e.target.value)} title="Suggestions from">
            <option value="">No suggestions</option>
            {PHASE_TEMPLATES.map((t) => <option key={t.key} value={t.key}>Suggestions for {labelOf(t.key)}</option>)}
          </select>
        </div>

        <div className="setup-cols">
          <section>
            <div className="setup-head"><strong>Tasks and milestones</strong><span className="muted small">{pickedTasks.length} of {tasks.length}</span></div>
            <ul className="pick-list">
              {tasks.map((t) => {
                const mt = t.milestone ? milestoneType(t.mtype) : null
                return (
                  <li key={t.key}>
                    <label className={t.on ? '' : 'off'}>
                      <input type="checkbox" checked={t.on} onChange={(e) => setTasks((ts) => ts.map((x) => (x.key === t.key ? { ...x, on: e.target.checked } : x)))} />
                      {t.milestone && <span className="diamond" style={mt ? { background: mt.color } : undefined} title={mt ? `${mt.label} milestone` : 'Milestone'} />}
                      <span>
                        {t.title}
                        {t.hint && <span className="pick-hint">{t.hint}</span>}
                        {t.checklist && t.on && <span className="pick-hint">{t.checklist.length}-item checklist: {t.checklist.slice(0, 3).join(', ').toLowerCase()}…</span>}
                      </span>
                      <span className="pick-when muted small">{shortDate(datesIn(phase, t.at, Boolean(t.milestone)).due_date)}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
            <div className="pick-own">
              <input className="field boxed" placeholder="Add your own task…" value={own} onChange={(e) => setOwn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn() } }} />
              <button className="btn" disabled={!own.trim()} onClick={addOwn}>Add</button>
            </div>
          </section>

          <section>
            <div className="setup-head"><strong>Sheets in this set</strong><span className="muted small">{sheetCount} sheet{sheetCount === 1 ? '' : 's'}</span></div>
            {shownSheets.length === 0 && <p className="muted small">This phase usually has no new sheets. Show all types to add some anyway.</p>}
            <ul className="pick-list sheets">
              {shownSheets.map((s) => {
                const st = sheetTypeById(s.type)
                if (!st) return null
                const setS = (c: Partial<SheetPick>) => setSheets((ss) => ss.map((x) => (x.type === s.type ? { ...x, ...c } : x)))
                return (
                  <li key={s.type}>
                    <label className={s.on ? '' : 'off'}>
                      <input type="checkbox" checked={s.on} onChange={(e) => setS({ on: e.target.checked, count: Math.max(1, s.count) })} />
                      <span>
                        {st.name}
                        <span className="pick-hint">{st.checklist.length ? `${st.checklist.length}-item checklist` : 'no checklist'}{st.series ? ` · ${st.series}xx` : ''}</span>
                      </span>
                    </label>
                    <span className="stepper">
                      <button type="button" onClick={() => setS({ count: Math.max(0, s.count - 1), on: s.count - 1 > 0 })} disabled={!s.on} aria-label={`Fewer ${st.name}`}>−</button>
                      <input type="number" min={0} max={50} value={s.on ? s.count : ''} placeholder="0" aria-label={`${st.name} count`}
                        onChange={(e) => { const n = Math.max(0, Math.min(50, Number(e.target.value) || 0)); setS({ count: n, on: n > 0 }) }} />
                      <button type="button" onClick={() => setS({ count: (s.on ? s.count : 0) + 1, on: true })} aria-label={`More ${st.name}`}>+</button>
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="pick-foot">
              <button className="linkbtn" onClick={() => setMoreSheets(!moreSheets)}>{moreSheets ? 'Show the usual sheets only' : 'Show all sheet types'}</button>
              {sheetCount > 0 && (
                <label className="inline-check small">
                  <input type="checkbox" checked={autoNumber} onChange={(e) => setAutoNumber(e.target.checked)} />
                  Number them (A101, A501…)
                </label>
              )}
            </div>
          </section>
        </div>
      </div>
    </Modal>
  )
}

const LABELS: Record<string, string> = { predesign: 'Predesign', sd: 'Schematic Design', dd: 'Design Development', cd: 'Construction Documents', ffe: 'FF&E', bidding: 'Bidding', ca: 'Construction Administration' }
const labelOf = (k: string) => LABELS[k] ?? k

/** Every sheet type, with the template's picks ticked and counted. */
function sheetPicks(from: { type: string; count: number; on: boolean }[]): SheetPick[] {
  return SHEET_TYPES.filter((t) => t.id !== 'other').map((t) => {
    const f = from.find((x) => x.type === t.id)
    return { type: t.id, count: f ? f.count : 1, on: f ? f.on : false }
  })
}
