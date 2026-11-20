import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/authContext.ts'
import { AssigneeChip, DateChip, Pop } from '../components/TaskChips.tsx'
import { TextField } from '../components/fields.tsx'
import { assigneesOf, assignPatch, initialsOf } from '../lib/assignees.ts'
import { insertMany, usingSampleData } from '../lib/data.ts'
import { today } from '../lib/dates.ts'
import { useProject } from '../lib/projectContext.ts'
import { ask, inRevit, revitMock, sameNumber, useRevit, type RevitActive, type RevitModel, type RevitSheet, type RevitView, type UpdateStatus } from '../lib/revitHost.ts'
import { carryRows, phaseOrder, phaseShort } from '../lib/sheetLinks.ts'
import { guessSheetType, SHEET_TYPES, sheetRows, sheetTypeById } from '../lib/sheetTypes.ts'
import { buildTree, childrenOf, isItem, progressOf, rolledDates, type Tree } from '../lib/tree.ts'
import type { Person, Phase, Project, Task } from '../lib/types.ts'
import { useProjectPlan } from '../lib/useProjectPlan.ts'

/**
 * The panel the Revit add-in shows: docked at the side of Revit (the full panel) and as a small floating
 * checklist on the sheet (?mode=overlay). It follows whatever sheet or view is open in Revit and shows that
 * sheet's tasks for the phase being worked on. Linking is by Revit UniqueId, kept on the app's rows
 * (tasks.revit_id, projects.revit_models), so nothing is written into the model.
 */

const SITE = 'https://amrjacob.github.io/archMGMT/'
const DOWNLOAD = 'https://github.com/AMRJacob/archMGMT/releases/latest/download/archMGMT-Revit-Setup.exe'
const byNumber = (a: { number: string }, b: { number: string }) => a.number.localeCompare(b.number, undefined, { numeric: true })

type Plan = ReturnType<typeof useProjectPlan>
interface Ctx {
  plan: Plan
  tree: Tree
  project: Project
  /** Where new sheets and carried copies go: the phase filtered to, else the one today falls in. */
  phase: Phase
  /** Only this phase's work is shown (null: every phase). */
  phaseFilter: Phase | null
  phases: Phase[]
  people: Person[]
  me: Person | null
  model: RevitModel
  onlyMine: boolean
  /** Hide what's already done. */
  openOnly: boolean
  compact: boolean
  say: (text: string) => void
}

/** Everyone a row falls to: its own people, or (when nobody's on it) whoever has the task or sheet above it. */
function crewOf(tree: Tree, t: Task): string[] {
  for (let cur: Task | undefined = t, d = 0; cur && d < 6; cur = cur.parent_id ? tree.byId.get(cur.parent_id) : undefined, d++) {
    const ids = assigneesOf(cur)
    if (ids.length) return ids
  }
  return []
}
const isMine = (c: Ctx, t: Task) => Boolean(c.me && crewOf(c.tree, t).includes(c.me.id))
const nextOrder = (rows: Task[]) => rows.reduce((m, t) => Math.max(m, t.sort_order), rows.length - 1) + 1

/** Filters shared by the pane and the floating checklist (two windows of the same page), remembered between sessions. */
interface Filters { mine: boolean; open: boolean; phase: Record<string, string> }
const FILTER_KEY = 'archmgmt.revit.filters'
function readFilters(): Filters {
  try { return { mine: false, open: true, phase: {}, ...(JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}') as Partial<Filters>) } }
  catch { return { mine: false, open: true, phase: {} } }
}
function useFilters() {
  const [f, setF] = useState<Filters>(readFilters)
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === FILTER_KEY) setF(readFilters()) }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])
  const set = (next: Partial<Filters>) => {
    const merged = { ...readFilters(), ...next }
    setF(merged)
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(merged)) } catch { /* private mode */ }
  }
  return [f, set] as const
}

export default function RevitPanel() {
  const [params] = useSearchParams()
  const compact = params.get('mode') === 'overlay'
  const { session } = useAuth()
  const { projects, patch: patchProject } = useProject()
  const revit = useRevit()
  const { model, info } = revit

  const live = projects.filter((p) => !p.archived_at)
  const project = model?.open ? live.find((p) => (p.revit_models ?? []).includes(model.modelId)) ?? null : null
  const plan = useProjectPlan(project?.id ?? '')
  const tree = useMemo(() => buildTree(plan.tasks.rows), [plan.tasks.rows])
  const phases = useMemo(() => phaseOrder(plan.phases.rows), [plan.phases.rows])

  // Every phase's work on a sheet shows unless one phase is picked as a filter. New sheets go into the phase
  // filtered to, else the one today falls in.
  const [filters, setFilters] = useFilters()
  const t0 = today()
  const phaseFilter = phases.find((p) => p.id === (project ? filters.phase[project.id] : '')) ?? null
  const phase = phaseFilter ?? phases.find((p) => p.start_date <= t0 && t0 <= p.end_date) ?? phases.find((p) => p.start_date > t0) ?? phases[phases.length - 1] ?? null
  const pickPhase = (id: string) => { if (project) setFilters({ phase: { ...filters.phase, [project.id]: id } }) }

  const email = session?.user.email?.toLowerCase() ?? null
  const me = (email ? plan.people.rows.find((p) => (p.email ?? '').toLowerCase() === email) : null)
    ?? (usingSampleData ? plan.people.rows.find((p) => p.kind === 'staff') ?? null : null)

  const [tab, setTab] = useState<'sheet' | 'all'>('sheet')
  const onlyMine = filters.mine, openOnly = filters.open
  const toggleMine = () => setFilters({ mine: !onlyMine })
  const toggleOpen = () => setFilters({ open: !openOnly })
  const [folded, setFolded] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const say = (text: string) => { setNote(text); window.setTimeout(() => setNote((n) => (n === text ? null : n)), 6000) }

  // A sheet picked by a right-click in Revit stays shown until another view is opened there.
  const [pin, setPin] = useState<{ id: string; over: string | null; addTask: boolean } | null>(null)
  const activeId = model?.active?.id ?? null
  const pinned = pin && pin.over === activeId ? pin : null

  // Right-click and ribbon commands from Revit.
  const cmd = revit.command
  const ready = Boolean(project && phase && model) && !plan.tasks.loading
  useEffect(() => {
    if (!cmd || compact) return
    // Held until the model is linked to a project and its sheets have loaded (number matching needs them).
    if (!ready || !project || !phase || !model) return
    revit.clearCommand()
    const first = cmd.ids.find((id) => model.sheets.some((s) => s.id === id)) ?? cmd.ids[0]
    // Reacting to a command sent by Revit: an event from outside the page.
    /* eslint-disable react-hooks/set-state-in-effect */
    setTab('sheet')
    if (cmd.name === 'add') {
      const sheets = model.sheets.filter((s) => cmd.ids.includes(s.id))
      if (sheets.length) void addSheets({ plan, tree, project, phase, phases, model }, sheets).then((r) => { if (r) setNote(r) })
      else setNote('Pick one or more sheets to add (views are added as tasks from their sheet).')
    }
    if (first) setPin({ id: first, over: activeId, addTask: cmd.name === 'task' })
    /* eslint-enable react-hooks/set-state-in-effect */
    // oxlint-disable-next-line react/exhaustive-deps
  }, [cmd, ready])

  // The floating panel tells the add-in how tall it needs to be.
  const root = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!compact || !root.current) return
    const el = root.current
    const send = () => void ask('overlaySize', { height: Math.ceil(el.getBoundingClientRect().height) }).catch(() => undefined)
    const ro = new ResizeObserver(send)
    ro.observe(el)
    send()
    return () => ro.disconnect()
  }, [compact])

  if (!inRevit) {
    return (
      <div className="rv rv-plain">
        <h1>archMGMT for Revit</h1>
        <p>This page is the panel the Revit add-in shows beside your sheets: the tasks for the sheet or view you have open, ticked off as you work.</p>
        <p><a className="btn primary" href={DOWNLOAD}>Download the Revit add-in</a></p>
        <p className="muted small">Revit 2026 · installs for your Windows account, no admin rights · updates itself. Add <code>?host=mock</code> before the # to try this panel against a pretend model.</p>
      </div>
    )
  }

  const ctx: Ctx | null = project && phase && model ? { plan, tree, project, phase, phaseFilter, phases, people: plan.people.rows, me, model, onlyMine, openOnly, compact, say } : null
  const target = ctx ? targetOf(ctx.model, pinned?.id ?? null) : null

  if (compact) {
    return (
      <div className="rv rv-overlay" ref={root}>
        {!ctx ? <div className="rv-ov-head"><span className="rv-ov-title muted">{model?.open ? 'Link this model in the archMGMT pane' : 'archMGMT'}</span></div>
          : <Overlay c={ctx} target={target} folded={folded} onFold={() => setFolded(!folded)} onMine={toggleMine} onOpen={toggleOpen} onPhase={pickPhase} />}
      </div>
    )
  }

  return (
    <div className="rv" ref={root}>
      {revitMock && <MockBar />}
      <header className="rv-head">
        <div className="rv-brand"><span className="arch">arch</span><span className="mgmt">MGMT</span></div>
        {project && (
          <Pop align="right" title="Project" label={<span className="rv-project">{project.number ? `${project.number} · ` : ''}{project.name} ▾</span>}>
            {(close) => (
              <div className="pm-list">
                <button className="pm-item" onClick={() => { void ask('openUrl', { url: `${SITE}#/projects/${project.id}` }); close() }}>Open in archMGMT ↗</button>
                <div className="pm-sep" />
                <div className="pm-label">This model belongs to</div>
                {live.map((p) => (
                  <button key={p.id} className={`pm-item${p.id === project.id ? ' on' : ''}`} onClick={() => {
                    if (p.id !== project.id && model) {
                      void patchProject(project.id, { revit_models: (project.revit_models ?? []).filter((x) => x !== model.modelId) })
                      void patchProject(p.id, { revit_models: [...(p.revit_models ?? []), model.modelId] })
                    }
                    close()
                  }}>{p.number ? `${p.number} · ` : ''}{p.name}</button>
                ))}
              </div>
            )}
          </Pop>
        )}
      </header>

      {revit.error && <p className="rv-note warn">{revit.error} <button className="linkbtn" onClick={() => void revit.refresh()}>Try again</button></p>}
      {note && <p className="rv-note">{note}</p>}

      {!model ? <p className="rv-empty">Reading the model…</p>
        : !model.open ? <p className="rv-empty">Open a project in Revit to see its sheets and tasks here.</p>
        : !project ? <LinkModel model={model} projects={live} onLink={(p) => void patchProject(p.id, { revit_models: [...(p.revit_models ?? []), model.modelId] })} />
        : !ctx ? <p className="rv-empty">{plan.phases.loading ? 'Loading…' : 'This project has no phases yet. Add one in archMGMT first.'}</p>
        : (
          <>
            <div className="rv-bar">
              <select className="field boxed rv-phase" value={phaseFilter?.id ?? ''} onChange={(e) => pickPhase(e.target.value)} aria-label="Phase" title="Show every phase's work on a sheet, or just one phase's">
                <option value="">All phases</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <div className="segmented small-seg">
                <button className={tab === 'sheet' ? 'on' : ''} onClick={() => setTab('sheet')}>This sheet</button>
                <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All sheets</button>
              </div>
            </div>
            <div className="rv-bar rv-sub">
              <label className="inline-check small" title={me ? `Only what's assigned to ${me.name}` : 'Your sign-in isn’t linked to a name on the Team list yet'}>
                <input type="checkbox" checked={onlyMine} onChange={toggleMine} disabled={!me} /> Only mine
              </label>
              <label className="inline-check small" title="Hide what's already done">
                <input type="checkbox" checked={openOnly} onChange={toggleOpen} /> Open only
              </label>
              <label className="inline-check small" title="A small checklist floating on the sheet in Revit">
                <input type="checkbox" checked={Boolean(info?.overlay)} onChange={(e) => void ask<boolean>('setOverlay', { on: e.target.checked }).then((on) => revit.setInfo((i) => (i ? { ...i, overlay: on } : i)))} /> Show on sheet
              </label>
            </div>
            <div className="rv-body">
              {tab === 'all' ? <AllSheets c={ctx} /> : <ThisSheet c={ctx} target={target} addTask={Boolean(pinned?.addTask)} />}
            </div>
          </>
        )}

      <footer className="rv-foot">
        {info?.update && <Updates u={info.update} onChange={(u) => revit.setInfo((i) => (i ? { ...i, update: u } : i))} />}
        {session && <span className="muted">{session.user.email}</span>}
      </footer>
    </div>
  )
}

// ---------- what's on screen in Revit ----------

interface Target { sheets: RevitSheet[]; view: RevitActive | null; none: boolean }
function targetOf(model: RevitModel, pinnedId: string | null): Target {
  const id = pinnedId ?? model.active?.id ?? null
  const sheet = model.sheets.find((s) => s.id === id)
  if (sheet) return { sheets: [sheet], view: null, none: false }
  // A view picked by right-click: the sheets it's on.
  if (pinnedId) {
    const on = model.sheets.filter((s) => s.views.some((v) => v.id === pinnedId))
    const v = on[0]?.views.find((x) => x.id === pinnedId)
    if (v) return { sheets: on, view: { id: v.id, name: v.name, kind: 'view', sheetIds: on.map((s) => s.id) }, none: false }
  }
  const a = model.active
  if (!pinnedId && a && a.kind === 'view') return { sheets: model.sheets.filter((s) => a.sheetIds.includes(s.id)), view: a, none: false }
  return { sheets: [], view: null, none: true }
}

/** The app's rows for a Revit sheet (one per phase it's in, in phase order), and the ones the phase filter lets through. */
function rowsFor(c: Pick<Ctx, 'plan' | 'phases' | 'phaseFilter'>, revitId: string) {
  const rank = new Map(c.phases.map((p, i) => [p.id, i]))
  const all = c.plan.tasks.rows.filter((t) => t.kind === 'sheet' && t.revit_id === revitId)
    .sort((a, b) => (rank.get(a.phase_id ?? '') ?? 99) - (rank.get(b.phase_id ?? '') ?? 99))
  return { all, shown: c.phaseFilter ? all.filter((t) => t.phase_id === c.phaseFilter!.id) : all }
}

/** What the filters let through: a row itself, or anything under it. */
function passes(c: Ctx, t: Task): boolean {
  const self = (!c.onlyMine || isMine(c, t)) && (!c.openOnly || t.status !== 'done')
  const kids = childrenOf(c.tree, t.id)
  // A task with subtasks shows while any of them do; ticking the last one off lets it go.
  if (kids.length && !isItem(t)) return kids.some((k) => passes(c, k)) || (self && !c.openOnly)
  return self
}
const filterWords = (c: Ctx) => [c.onlyMine && 'yours', c.openOnly && 'open'].filter(Boolean).join(' and ')

function ThisSheet({ c, target, addTask }: { c: Ctx; target: Target | null; addTask: boolean }) {
  if (!target || target.none) {
    return <><p className="rv-empty">Open a sheet, or a view that's on a sheet, to see its tasks.</p><MyWork c={c} /></>
  }
  const { view } = target
  return (
    <>
      {view && <ViewTasks c={c} view={view} sheets={target.sheets} />}
      {view && target.sheets.length === 0 && <><p className="rv-empty">This view isn’t on a sheet yet. Tasks are kept by sheet.</p><MyWork c={c} /></>}
      {target.sheets.map((s) => <SheetCard key={s.id} c={c} sheet={s} addTask={addTask} viewId={view?.id ?? null} />)}
    </>
  )
}

/** Tasks that stand for the view on screen (a task under a sheet, linked to the Revit view). */
function ViewTasks({ c, view, sheets }: { c: Ctx; view: RevitActive; sheets: RevitSheet[] }) {
  const linked = c.plan.tasks.rows.filter((t) => t.kind === 'task' && t.revit_id === view.id)
  const here = c.phaseFilter ? linked.filter((t) => t.phase_id === c.phaseFilter!.id) : linked
  // A new task for the view goes under its sheet: the copy in the working phase, else the latest one.
  const hostRows = sheets.flatMap((s) => rowsFor(c, s.id).all)
  const host = hostRows.find((t) => t.phase_id === c.phase.id) ?? hostRows[hostRows.length - 1] ?? null
  return (
    <section className="rv-view">
      <div className="rv-view-head"><span className="rv-kicker">View</span> <strong>{view.name}</strong>
        {sheets.length > 0 && <span className="muted"> · on {sheets.map((s) => s.number).join(', ')}</span>}</div>
      {here.length === 0 && host && (
        <button className="btn small" onClick={() => void addViewTask(c, host, view)}>+ Task for this view</button>
      )}
      {here.length === 0 && linked.length > 0 && <p className="muted small">Has a task in {linked.map((t) => phaseFull(c, t.phase_id)).join(', ')}.</p>}
    </section>
  )
}

async function addViewTask(c: Ctx, sheetRow: Task, view: { id: string; name: string }) {
  await c.plan.tasks.add({
    id: crypto.randomUUID(), project_id: c.project.id, phase_id: sheetRow.phase_id, parent_id: sheetRow.id, kind: 'task', title: view.name,
    revit_id: view.id, ...assignPatch(assigneesOf(sheetRow)), start_date: null, due_date: null, estimated_hours: null, effort: 2, status: 'todo',
    is_milestone: false, client_visible: false, sort_order: nextOrder(childrenOf(c.tree, sheetRow.id)),
  })
}

const phaseName = (c: Pick<Ctx, 'phases'>, id: string | null | undefined) => { const p = c.phases.find((x) => x.id === id); return p ? phaseShort(p) : '' }
const phaseFull = (c: Pick<Ctx, 'phases'>, id: string | null | undefined) => c.phases.find((x) => x.id === id)?.name ?? 'no phase'

// ---------- one sheet ----------

function SheetCard({ c, sheet, addTask, viewId }: { c: Ctx; sheet: RevitSheet; addTask: boolean; viewId: string | null }) {
  const { all, shown } = rowsFor(c, sheet.id)
  if (shown.length) {
    // One block per phase the sheet has work in; the working phase's block takes a right-click "Add a task".
    const focusRow = shown.find((t) => t.phase_id === c.phase.id) ?? shown[shown.length - 1]
    return <>{shown.map((row) => <SheetTasks key={row.id} c={c} sheet={sheet} row={row} rows={all} addTask={addTask && row.id === focusRow.id} viewId={viewId} />)}</>
  }
  return (
    <section className="rv-card">
      <SheetTitle number={sheet.number} name={sheet.name} />
      {all.length > 0 ? (
        <div className="rv-pad">
          <p className="muted small">Nothing for this sheet in {c.phaseFilter?.name}. It has work in {all.map((t) => phaseFull(c, t.phase_id)).join(', ')}.</p>
          <CarryInto c={c} rows={all} />
        </div>
      ) : <Unlinked c={c} sheet={sheet} />}
    </section>
  )
}

function SheetTitle({ number, name, right }: { number: string | null | undefined; name: string; right?: ReactNode }) {
  return <div className="rv-title"><span className="mono rv-no">{number || '—'}</span><span className="rv-name" title={name}>{name}</span>{right}</div>
}

/** Give the sheet a copy in the working phase (with its type's standard subtasks), from its latest copy. */
function CarryInto({ c, rows, quiet = false, onDone }: { c: Ctx; rows: Task[]; quiet?: boolean; onDone?: () => void }) {
  const [busy, setBusy] = useState(false)
  if (rows.some((t) => t.phase_id === c.phase.id)) return null
  const latest = rows[rows.length - 1]
  return (
    <button className={quiet ? 'pm-item' : 'btn primary small'} disabled={busy} onClick={async () => {
      setBusy(true)
      try {
        const top = childrenOf(c.tree, null).filter((t) => t.phase_id === c.phase.id)
        const r = carryRows(latest, c.phase, { sortOrder: nextOrder(top), withSubtasks: true })
        if (r.linkSource) void c.plan.tasks.patch(latest.id, { sheet_link: r.linkSource })
        await insertMany<Task>('tasks', [r.sheet, ...r.items])
        await c.plan.tasks.reload()
      } catch (e) { c.say(`Couldn’t carry it: ${e instanceof Error ? e.message : String(e)}`) } finally { setBusy(false); onDone?.() }
    }}>Carry into {c.phase.name}</button>
  )
}

/** App sheets a Revit sheet could be linked to: not linked to Revit yet, one per drawing (the copy in this phase first). */
function linkable(c: Pick<Ctx, 'plan' | 'phase'>): Task[] {
  const seen = new Map<string, Task>()
  for (const t of c.plan.tasks.rows) {
    if (t.kind !== 'sheet' || t.revit_id) continue
    const key = t.sheet_link ?? t.id
    const prev = seen.get(key)
    if (!prev || (t.phase_id === c.phase.id && prev.phase_id !== c.phase.id)) seen.set(key, t)
  }
  return [...seen.values()].sort((a, b) => (a.sheet_number ?? '~').localeCompare(b.sheet_number ?? '~', undefined, { numeric: true }))
}

/** Tie an app sheet (and its copies in other phases) to a Revit sheet. */
function linkRow(c: Pick<Ctx, 'plan'>, row: Task, sheet: RevitSheet) {
  // Every linked drawing gets a link id, so its copies in other phases stay tied to the same Revit sheet.
  const change: Partial<Task> = row.sheet_link ? { revit_id: sheet.id } : { revit_id: sheet.id, sheet_link: crypto.randomUUID() }
  void c.plan.tasks.patch(row.id, change)
  if (row.sheet_link) for (const o of c.plan.tasks.rows) if (o.id !== row.id && o.kind === 'sheet' && o.sheet_link === row.sheet_link && o.phase_id !== row.phase_id) void c.plan.tasks.patch(o.id, { revit_id: sheet.id })
}

/** New rows that add a Revit sheet to the phase: the sheet and its type's standard subtasks. */
function newSheetRows(c: Pick<Ctx, 'project'>, phase: Phase, sheet: RevitSheet, typeId: string, sortOrder: number): Partial<Task>[] {
  const r = sheetRows({ projectId: c.project.id, phaseId: phase.id, number: sheet.number, name: sheet.name, typeId, start: phase.start_date, due: phase.end_date, assigneeId: null, sortOrder })
  return [{ ...r.sheet, revit_id: sheet.id, sheet_link: crypto.randomUUID() }, ...r.items.map((i) => ({ ...i, assignee_ids: [] }))]
}

/**
 * Bring Revit sheets into the phase: ones whose number matches an app sheet are linked to it; the rest are added
 * with their type's standard subtasks. Returns a line saying what happened.
 */
async function addSheets(c: Pick<Ctx, 'plan' | 'tree' | 'project' | 'phase' | 'phases' | 'model'>, sheets: RevitSheet[]): Promise<string> {
  const free = linkable(c)
  let linked = 0
  const rows: Partial<Task>[] = []
  let order = nextOrder(childrenOf(c.tree, null).filter((t) => t.phase_id === c.phase.id))
  let skipped = 0
  for (const s of sheets) {
    if (c.plan.tasks.rows.some((t) => t.kind === 'sheet' && t.revit_id === s.id)) { skipped++; continue }
    const m = free.find((t) => sameNumber(t.sheet_number, s.number))
    if (m) { free.splice(free.indexOf(m), 1); linkRow(c, m, s); linked++; continue }
    rows.push(...newSheetRows(c, c.phase, s, guessSheetType(s.number, s.name), order++))
  }
  const added = rows.filter((r) => r.kind === 'sheet').length
  try {
    if (rows.length) { await insertMany<Task>('tasks', rows); await c.plan.tasks.reload() }
  } catch (e) { return `Couldn’t add them: ${e instanceof Error ? e.message : String(e)}` }
  const parts = [added && `${added} added to ${c.phase.name}`, linked && `${linked} linked by sheet number`, skipped && `${skipped} already in archMGMT`].filter(Boolean)
  return parts.length ? `Sheets: ${parts.join(', ')}.` : ''
}

function Unlinked({ c, sheet }: { c: Ctx; sheet: RevitSheet }) {
  const free = linkable(c)
  const matches = free.filter((t) => sameNumber(t.sheet_number, sheet.number))
  const [typeId, setTypeId] = useState(() => guessSheetType(sheet.number, sheet.name))
  const [phaseId, setPhaseId] = useState(c.phase.id)
  const into = c.phases.find((p) => p.id === phaseId) ?? c.phase
  const [busy, setBusy] = useState(false)
  const type = sheetTypeById(typeId)
  return (
    <div className="rv-pad">
      <p className="muted small">Not in archMGMT yet.</p>
      {matches.map((m) => (
        <button key={m.id} className="btn primary small rv-wide" onClick={() => linkRow(c, m, sheet)}>
          Link to {m.sheet_number} {m.title} <span className="rv-dim">({phaseFull(c, m.phase_id)})</span>
        </button>
      ))}
      <div className="rv-addrow">
        <select className="field boxed" value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Sheet type" title="Sets the standard subtasks">
          {SHEET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className={`btn small${matches.length ? '' : ' primary'}`} disabled={busy} onClick={async () => {
          setBusy(true)
          try {
            await insertMany<Task>('tasks', newSheetRows(c, into, sheet, typeId, nextOrder(childrenOf(c.tree, null).filter((t) => t.phase_id === into.id))))
            await c.plan.tasks.reload()
          } catch (e) { c.say(`Couldn’t add it: ${e instanceof Error ? e.message : String(e)}`) } finally { setBusy(false) }
        }}>Add</button>
      </div>
      <label className="rv-into muted small">to phase
        <select className="field boxed" value={into.id} onChange={(e) => setPhaseId(e.target.value)} aria-label="Phase to add it to">
          {c.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <p className="muted small">{type?.checklist.length ? `Adds ${type.checklist.length} standard subtasks for this type.` : 'No standard subtasks for this type.'}</p>
      {free.length > matches.length && (
        <select className="field boxed rv-wide" value="" onChange={(e) => { const m = free.find((t) => t.id === e.target.value); if (m) linkRow(c, m, sheet) }} aria-label="Link to another sheet">
          <option value="">Link to a sheet already in archMGMT…</option>
          {free.map((t) => <option key={t.id} value={t.id}>{t.sheet_number ?? '—'} {t.title} ({phaseFull(c, t.phase_id)})</option>)}
        </select>
      )}
    </div>
  )
}

function SheetTasks({ c, sheet, row, rows, addTask, viewId }: { c: Ctx; sheet: RevitSheet; row: Task; rows: Task[]; addTask: boolean; viewId: string | null }) {
  const { plan, tree } = c
  const patch = (t: Task, ch: Partial<Task>) => void plan.tasks.patch(t.id, ch)
  const kids = childrenOf(tree, row.id)
  const prog = progressOf(tree, row)
  const r = rolledDates(tree, row)
  const differs = !sameNumber(row.sheet_number, sheet.number) || (row.title ?? '').trim().toLowerCase() !== sheet.name.trim().toLowerCase()
  const [showViews, setShowViews] = useState(false)
  const viewTask = (v: RevitView) => plan.tasks.rows.find((t) => t.kind === 'task' && t.revit_id === v.id && t.phase_id === row.phase_id) ?? null
  const shown = (t: Task): boolean => passes(c, t)
  const list = kids.filter(shown)
  const latest = rows[rows.length - 1]?.id === row.id

  return (
    <section className={`rv-card${isMine(c, row) ? ' mine' : ''}`}>
      <SheetTitle number={row.sheet_number} name={row.title} right={
        <span className="rv-title-right">
          <span className="rv-prog" title={`${prog.done} of ${prog.total} done`}>{prog.done}/{prog.total}</span>
          <AssigneeChip task={row} people={c.people} onPatch={(x) => patch(row, x)} />
          <Pop align="right" title="More" label={<span className="rv-more">⋯</span>}>
            {(close) => (
              <div className="pm-list">
                <button className="pm-item" onClick={() => { void ask('openUrl', { url: `${SITE}#/overview?find=${row.id}` }); close() }}>Open in archMGMT ↗</button>
                {latest && <CarryInto c={c} rows={rows} quiet onDone={close} />}
                <button className="pm-item" onClick={() => {
                  for (const o of plan.tasks.rows) if (o.kind === 'sheet' && o.revit_id === sheet.id && o.id !== row.id) void plan.tasks.patch(o.id, { revit_id: null })
                  patch(row, { revit_id: null }); close()
                }}>Unlink from this Revit sheet</button>
              </div>
            )}
          </Pop>
        </span>
      } />
      <div className="rv-meta">
        <span className="chip rv-phasechip" title={`This sheet's work in ${phaseFull(c, row.phase_id)}`}>{phaseFull(c, row.phase_id)}</span>
        <DateChip task={{ ...row, start_date: r.start, due_date: r.due }} onPatch={(x) => patch(row, x)} locked={r.rolled} />
        <div className="rv-progbar" aria-hidden="true"><i style={{ width: prog.total ? `${(100 * prog.done) / prog.total}%` : 0 }} /></div>
      </div>
      {differs && (
        <p className="rv-note small">Revit has <strong>{sheet.number} {sheet.name}</strong>.{' '}
          <button className="linkbtn" onClick={() => patch(row, { sheet_number: sheet.number, title: sheet.name })}>Use Revit’s</button></p>
      )}
      <ul className="rv-list">
        {list.map((t) => <Row key={t.id} c={c} t={t} depth={0} shown={shown} viewId={viewId} />)}
        {list.length === 0 && <li className="rv-none muted small">{kids.length ? `Nothing ${filterWords(c)} here (${kids.length} hidden by the filters).` : 'No tasks or subtasks yet.'}</li>}
      </ul>
      <AddLine c={c} parent={row} focus={addTask} allowTask />
      {sheet.views.length > 0 && (
        <div className="rv-views">
          <button className="linkbtn" onClick={() => setShowViews(!showViews)}>{showViews ? '▾' : '▸'} Views on this sheet ({sheet.views.length})</button>
          {showViews && (
            <ul>
              {sheet.views.map((v) => {
                const t = viewTask(v)
                return (
                  <li key={v.id}>
                    <button className="linkbtn rv-viewname" title="Open this view in Revit" onClick={() => void ask('open', { id: v.id }).catch((e: Error) => c.say(e.message))}>{v.name}</button>
                    {t ? <span className="muted small">has a task</span> : <button className="linkbtn small" onClick={() => void addViewTask(c, row, v)}>+ task</button>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

/** A task (with its subtasks under it) or a subtask. */
function Row({ c, t, depth, shown, viewId }: { c: Ctx; t: Task; depth: number; shown: (t: Task) => boolean; viewId: string | null }) {
  const patch = (ch: Partial<Task>) => void c.plan.tasks.patch(t.id, ch)
  const item = isItem(t)
  const done = t.status === 'done'
  const kids = item ? [] : childrenOf(c.tree, t.id).filter(shown)
  const [adding, setAdding] = useState(false)
  return (
    <>
      <li className={`rv-row${item ? ' item' : ' task'}${done ? ' done' : ''}${isMine(c, t) ? ' mine' : ''}${t.revit_id && t.revit_id === viewId ? ' current' : ''}`} style={{ paddingLeft: 8 + depth * 18 }}>
        {item
          ? <input type="checkbox" checked={done} title="Done" onChange={(e) => patch({ status: e.target.checked ? 'done' : 'todo' })} />
          : <button className={`tick ${t.status}`} title={done ? 'Mark not done' : 'Mark done'} onClick={() => patch({ status: done ? 'todo' : 'done' })}>{done ? '✓' : ''}</button>}
        <div className="rv-row-title"><TextField value={t.title} placeholder={item ? 'Subtask' : 'Task name'} onSave={(v) => { if (v) patch({ title: v }) }} /></div>
        {!item && t.revit_id && <button className="rv-viewlink" title="Open its view in Revit" onClick={() => void ask('open', { id: t.revit_id }).catch((e: Error) => c.say(e.message))}>▣</button>}
        {!item && <DateChip task={t} onPatch={patch} />}
        <AssigneeChip task={t} people={c.people} onPatch={patch} />
        <Pop align="right" title="More" label={<span className="rv-more">⋯</span>}>
          {(close) => (
            <div className="pm-list">
              {!item && <button className="pm-item" onClick={() => { setAdding(true); close() }}>Add subtask</button>}
              <button className="pm-item danger" onClick={() => { if (window.confirm(`Delete "${t.title}"${!item && childrenOf(c.tree, t.id).length ? ' and its subtasks' : ''}?`)) void c.plan.tasks.drop(t.id); close() }}>Delete</button>
            </div>
          )}
        </Pop>
      </li>
      {kids.map((k) => <Row key={k.id} c={c} t={k} depth={depth + 1} shown={shown} viewId={viewId} />)}
      {adding && <li className="rv-addli" style={{ paddingLeft: 8 + (depth + 1) * 18 }}><AddLine c={c} parent={t} focus onDone={() => setAdding(false)} /></li>}
    </>
  )
}

/** Type a line, press Enter: a subtask (or a task) under `parent`. Stays ready for the next one. */
function AddLine({ c, parent, focus = false, allowTask = false, onDone }: { c: Ctx; parent: Task; focus?: boolean; allowTask?: boolean; onDone?: () => void }) {
  const [kind, setKind] = useState<'item' | 'task'>('item')
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focus) input.current?.focus() }, [focus])
  const add = async () => {
    const title = text.trim()
    if (!title) { onDone?.(); return }
    setText('')
    await c.plan.tasks.add({
      id: crypto.randomUUID(), project_id: c.project.id, phase_id: parent.phase_id, parent_id: parent.id, kind, title,
      ...assignPatch(kind === 'task' ? assigneesOf(parent) : []), start_date: null, due_date: null, estimated_hours: null,
      effort: kind === 'item' ? null : 2, status: 'todo', is_milestone: false, client_visible: false, sort_order: nextOrder(childrenOf(c.tree, parent.id)),
    })
  }
  return (
    <div className="rv-add">
      <input ref={input} className="field boxed" value={text} placeholder={kind === 'item' ? 'Add a subtask…' : 'Add a task…'}
        onChange={(e) => setText(e.target.value)} onBlur={() => { if (!text.trim()) onDone?.() }}
        onKeyDown={(e) => { if (e.key === 'Enter') void add(); if (e.key === 'Escape') { setText(''); onDone?.() } }} />
      {allowTask && (
        <div className="segmented small-seg" title="A subtask is a tick-box line; a task has dates and can be scheduled">
          <button className={kind === 'item' ? 'on' : ''} onClick={() => setKind('item')}>Subtask</button>
          <button className={kind === 'task' ? 'on' : ''} onClick={() => setKind('task')}>Task</button>
        </div>
      )}
    </div>
  )
}

// ---------- every sheet in the model ----------

function AllSheets({ c }: { c: Ctx }) {
  const [busy, setBusy] = useState(false)
  const sheets = [...c.model.sheets].sort(byNumber)
  const free = linkable(c)
  const state = (s: RevitSheet) => {
    const { all, shown } = rowsFor(c, s.id)
    if (all.length) return { kind: 'linked' as const, all, shown }
    return free.some((t) => sameNumber(t.sheet_number, s.number)) ? { kind: 'match' as const } : { kind: 'new' as const }
  }
  const todo = sheets.filter((s) => state(s).kind !== 'linked')
  const ids = new Set(c.model.sheets.map((s) => s.id))
  const appOnly = [...free, ...c.plan.tasks.rows.filter((t) => t.kind === 'sheet' && t.revit_id && !ids.has(t.revit_id))]
    .filter((t) => !c.phaseFilter || t.phase_id === c.phaseFilter.id)
  const open = (id: string) => void ask('open', { id }).catch((e: Error) => c.say(e.message))
  return (
    <>
      {todo.length > 0 && (
        <div className="rv-pad rv-bulk">
          <span className="muted small">{todo.length} Revit sheet{todo.length === 1 ? ' isn’t' : 's aren’t'} in archMGMT.</span>
          <button className="btn primary small" disabled={busy} onClick={async () => { setBusy(true); const r = await addSheets(c, todo); setBusy(false); if (r) c.say(r) }}>
            Add all to {c.phase.name}
          </button>
        </div>
      )}
      <ul className="rv-sheets">
        {sheets.map((s) => {
          const st = state(s)
          const rows = st.kind === 'linked' ? st.shown : []
          const row = rows[rows.length - 1] ?? null
          const work = rows.flatMap((r) => flat(c.tree, r.id))
          if (c.onlyMine && !rows.some((r) => isMine(c, r)) && !work.some((k) => isMine(c, k) && k.status !== 'done')) return null
          const leaves = work.filter((t) => isItem(t) || !childrenOf(c.tree, t.id).some((k) => !isItem(k)))
          const prog = rows.length ? { done: leaves.filter((t) => t.status === 'done').length, total: leaves.length } : null
          if (c.openOnly && prog && prog.total > 0 && prog.done === prog.total) return null
          const crew = row ? assigneesOf(row).map((id) => c.people.find((p) => p.id === id)).filter((p): p is Person => Boolean(p)) : []
          return (
            <li key={s.id} className={`${s.id === c.model.active?.id ? 'current' : ''}${row && isMine(c, row) ? ' mine' : ''}`}>
              <button className="rv-sheetbtn" title="Open this sheet in Revit" onClick={() => open(s.id)}>
                <span className="mono rv-no">{s.number}</span><span className="rv-name">{s.name}</span>
              </button>
              {prog && <span className={`rv-prog${prog.total && prog.done === prog.total ? ' all' : ''}`}>{prog.done}/{prog.total}</span>}
              {crew.length > 0 && <span className="rv-who">{crew.map((p) => initialsOf(p)).join(' ')}</span>}
              {st.kind === 'linked' && <span className="muted small" title="Phases this sheet has work in">{st.all.map((t) => phaseName(c, t.phase_id)).join(' ')}</span>}
              {(st.kind === 'match' || st.kind === 'new') && (
                <button className="linkbtn small" onClick={async () => { const r = await addSheets(c, [s]); if (r) c.say(r) }}>{st.kind === 'match' ? 'Link' : '+ Add'}</button>
              )}
            </li>
          )
        })}
      </ul>
      {appOnly.length > 0 && !c.onlyMine && (
        <>
          <div className="rv-kicker rv-pad">In archMGMT, no Revit sheet yet ({appOnly.length})</div>
          <ul className="rv-sheets quiet">
            {appOnly.map((t) => <li key={t.id}><span className="rv-sheetbtn"><span className="mono rv-no">{t.sheet_number ?? '—'}</span><span className="rv-name">{t.title}</span></span></li>)}
          </ul>
        </>
      )}
    </>
  )
}

/** Your open work on this model's sheets in this phase: click a sheet to open it in Revit. */
function MyWork({ c }: { c: Ctx }) {
  if (!c.me) return null
  const sheetRowsHere = c.plan.tasks.rows.filter((t) => t.kind === 'sheet' && t.revit_id && (!c.phaseFilter || t.phase_id === c.phaseFilter.id))
  const byRevit = new Map<string, { row: Task; open: number }>()
  for (const row of sheetRowsHere) {
    const open = flat(c.tree, row.id).filter((t) => t.status !== 'done' && isMine(c, t)).length
    const prev = byRevit.get(row.revit_id!)
    byRevit.set(row.revit_id!, { row, open: (prev?.open ?? 0) + open })
  }
  const mine = [...byRevit.values()].filter((x) => x.open > 0)
    .sort((a, b) => (a.row.sheet_number ?? '').localeCompare(b.row.sheet_number ?? '', undefined, { numeric: true }))
  if (!mine.length) return null
  return (
    <>
      <div className="rv-kicker rv-pad">Your open work{c.phaseFilter ? ` in ${c.phaseFilter.name}` : ''}</div>
      <ul className="rv-sheets">
        {mine.map(({ row, open }) => (
          <li key={row.id} className="mine">
            <button className="rv-sheetbtn" onClick={() => void ask('open', { id: row.revit_id }).catch((e: Error) => c.say(e.message))}>
              <span className="mono rv-no">{row.sheet_number ?? '—'}</span><span className="rv-name">{row.title}</span>
            </button>
            <span className="rv-prog">{open} open</span>
          </li>
        ))}
      </ul>
    </>
  )
}
const flat = (tree: Tree, id: string): Task[] => childrenOf(tree, id).flatMap((k) => [k, ...flat(tree, k.id)])

// ---------- the floating checklist on the sheet ----------

function Overlay({ c, target, folded, onFold, onMine, onOpen, onPhase }: {
  c: Ctx; target: Target | null; folded: boolean; onFold: () => void; onMine: () => void; onOpen: () => void; onPhase: (id: string) => void
}) {
  const sheet = target?.sheets[0] ?? null
  const { all, shown } = sheet ? rowsFor(c, sheet.id) : { all: [], shown: [] }
  const head = shown[shown.length - 1] ?? all[all.length - 1] ?? null
  const work = shown.flatMap((r) => flat(c.tree, r.id))
  const leaves = work.filter((t) => isItem(t) || !childrenOf(c.tree, t.id).some((k) => !isItem(k)))
  const prog = shown.length ? { done: leaves.filter((t) => t.status === 'done').length, total: leaves.length } : null
  const pass = (t: Task) => passes(c, t)
  const blocks = shown.map((row) => ({ row, lines: flatShown(c.tree, row.id, pass, 0) }))
  const count = blocks.reduce((n, b) => n + b.lines.length, 0)
  return (
    <>
      <div className="rv-ov-head">
        <button className="rv-ov-fold" onClick={onFold} title={folded ? 'Show the checklist' : 'Hide the checklist'}>{folded ? '▸' : '▾'}</button>
        <span className="rv-ov-title" title="Open the archMGMT pane" onClick={() => void ask('showPane')}>
          {sheet ? <><span className="mono">{head?.sheet_number ?? sheet.number}</span> {head?.title ?? sheet.name}</> : <span className="muted">No sheet open</span>}
        </span>
        {prog && <span className={`rv-prog${prog.total && prog.done === prog.total ? ' all' : ''}`}>{prog.done}/{prog.total}</span>}
      </div>
      {!folded && sheet && all.length > 0 && (
        <div className="rv-ov-filters">
          {c.me && <button className={c.onlyMine ? 'on' : ''} onClick={onMine} title="Only what's assigned to you">Mine</button>}
          <button className={c.openOnly ? 'on' : ''} onClick={onOpen} title="Hide what's already done">Open</button>
          <select value={c.phaseFilter?.id ?? ''} onChange={(e) => onPhase(e.target.value)} aria-label="Phase" title="Every phase's work on this sheet, or one phase's">
            <option value="">All phases</option>
            {c.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      {!folded && sheet && all.length === 0 && (
        <p className="rv-ov-note">This sheet isn’t in archMGMT yet. <button className="linkbtn" onClick={() => void ask('showPane')}>Open the pane</button> to add it or link it to one that is.</p>
      )}
      {!folded && all.length > 0 && (
        <ul className="rv-ov-list">
          {blocks.map(({ row, lines }) => (
            <OverlayBlock key={row.id} c={c} label={shown.length > 1 ? phaseFull(c, row.phase_id) : null} lines={lines} />
          ))}
          {count === 0 && (
            <li className="muted">{shown.length === 0 ? `Nothing for this sheet in ${c.phaseFilter?.name}.`
              : work.length ? `Nothing ${filterWords(c)} here (${work.length} hidden by the filters).` : 'No tasks on this sheet yet.'}</li>
          )}
        </ul>
      )}
    </>
  )
}

function OverlayBlock({ c, label, lines }: { c: Ctx; label: string | null; lines: { t: Task; depth: number }[] }) {
  if (!lines.length) return null
  return (
    <>
      {label && <li className="rv-ov-phase">{label}</li>}
      {lines.map(({ t, depth }) => {
        const done = t.status === 'done'
        const who = crewOf(c.tree, t).map((id) => initialsOf(c.people.find((p) => p.id === id))).filter(Boolean).join(' ')
        return (
          <li key={t.id} className={`${done ? 'done' : ''}${isMine(c, t) ? ' mine' : ''}${isItem(t) ? '' : ' task'}`} style={{ paddingLeft: 6 + depth * 14 }}>
            <label>
              <input type="checkbox" checked={done} onChange={(e) => void c.plan.tasks.patch(t.id, { status: e.target.checked ? 'done' : 'todo' })} />
              <span>{t.title || 'Untitled'}</span>
            </label>
            {who && <span className="rv-who">{who}</span>}
          </li>
        )
      })}
    </>
  )
}
const flatShown = (tree: Tree, id: string, shown: (t: Task) => boolean, depth: number): { t: Task; depth: number }[] =>
  childrenOf(tree, id).filter(shown).flatMap((k) => [{ t: k, depth }, ...flatShown(tree, k.id, shown, depth + 1)])

// ---------- first use: which project is this model? ----------

function LinkModel({ model, projects, onLink }: { model: RevitModel; projects: Project[]; onLink: (p: Project) => void }) {
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').toLowerCase()
  const match = projects.filter((p) => (norm(p.number) && norm(p.number) === norm(model.number)) || (norm(p.name) && norm(p.name) === norm(model.name)))
  const rest = projects.filter((p) => !match.includes(p))
  return (
    <div className="rv-pad rv-link">
      <h2>Which project is this model?</h2>
      <p className="muted small">{model.title}{model.number ? ` · Revit project number ${model.number}` : ''}. Picked once: everyone who opens this model gets the same project.</p>
      {match.map((p) => <button key={p.id} className="btn primary rv-wide" onClick={() => onLink(p)}>{p.number ? `${p.number} · ` : ''}{p.name}</button>)}
      {rest.length > 0 && (
        <select className="field boxed rv-wide" value="" onChange={(e) => { const p = projects.find((x) => x.id === e.target.value); if (p) onLink(p) }} aria-label="Project">
          <option value="">{match.length ? 'Another project…' : 'Choose a project…'}</option>
          {rest.map((p) => <option key={p.id} value={p.id}>{p.number ? `${p.number} · ` : ''}{p.name}</option>)}
        </select>
      )}
      {projects.length === 0 && <p className="muted small">No projects in archMGMT yet.</p>}
    </div>
  )
}

function Updates({ u, onChange }: { u: UpdateStatus; onChange: (u: UpdateStatus) => void }) {
  const [busy, setBusy] = useState(false)
  const run = async (type: 'checkUpdate' | 'installUpdate') => {
    setBusy(true)
    try { onChange(await ask<UpdateStatus>(type)) } catch { /* shown as-is */ } finally { setBusy(false) }
  }
  return (
    <span className="rv-update">
      Add-in {u.current}
      {u.pending ? <> · <strong>{u.pending} loads when Revit restarts</strong></>
        : u.available && u.latest ? <> · <button className="linkbtn" disabled={busy} onClick={() => void run('installUpdate')}>{busy ? 'Installing…' : `Install ${u.latest}`}</button></>
        : <> · <button className="linkbtn" disabled={busy} onClick={() => void run('checkUpdate')}>{busy ? 'Checking…' : 'Check for updates'}</button></>}
      {u.error && <span className="late" title={u.error}> !</span>}
    </span>
  )
}

/** Pretend-Revit controls, only with ?host=mock. */
function MockBar() {
  const [id, setId] = useState(revitMock!.activeId())
  return (
    <div className="rv-mock">
      Pretend Revit: open
      <select value={id} onChange={(e) => { setId(e.target.value); revitMock!.setActive(e.target.value) }}>
        {revitMock!.views().map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
      <button onClick={() => revitMock!.command('add', [id])}>right-click › Add</button>
    </div>
  )
}
