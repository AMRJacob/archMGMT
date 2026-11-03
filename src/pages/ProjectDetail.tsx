import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AmountField, SelectField, TextField } from '../components/fields.tsx'
import PersonOptions from '../components/PersonOptions.tsx'
import { MilestoneMark, TaskControls } from '../components/TaskChips.tsx'
import PlanTree from '../components/PlanTree.tsx'
import ContextMenu, { type MenuItem } from '../components/ContextMenu.tsx'
import PhaseEditor from '../components/PhaseEditor.tsx'
import { PhaseSetupDialog } from '../components/SetupDialogs.tsx'
import { insertMany } from '../lib/data.ts'
import { buildTree, isWorkLeaf } from '../lib/tree.ts'
import { addDays, daysBetween, formatDate, maxDate, minDate, nextMonday, shortDate, today } from '../lib/dates.ts'
import ColorPicker from '../components/ColorPicker.tsx'
import { projectAccent, projectPalette, textOn } from '../lib/colors.ts'
import { useProject } from '../lib/projectContext.ts'
import { PROJECT_STATUSES, type Phase, type ProjectStatus, type Task } from '../lib/types.ts'
import { useProjectPlan } from '../lib/useProjectPlan.ts'
import { area, BUILDING_TYPES, money } from '../lib/amount.ts'
import { isPresented, rulesOf, togglePresented } from '../lib/presentation.ts'

export default function ProjectDetail() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isNew = params.get('new') === '1'
  const projects = useProject()
  const project = projects.current
  const id = project?.id ?? ''
  const { phases, tasks, people, patchTask, patchMany } = useProjectPlan(id)
  const [openIds, setOpenIds] = useState<Set<string> | null>(null)
  const [newId, setNewId] = useState<string | null>(null)
  const [openFor, setOpenFor] = useState(id)
  const [phaseMenu, setPhaseMenu] = useState<{ x: number; y: number; phase: Phase } | null>(null)
  const [editingPhase, setEditingPhase] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [setupLocal, setSetupLocal] = useState<string | null>(null)
  // ?setup=<phase id> (from the New project dialog) opens that phase's setup.
  const setupId = setupLocal ?? params.get('setup')
  const closeSetup = () => { setSetupLocal(null); if (params.get('setup')) { params.delete('setup'); setParams(params, { replace: true }) } }

  const sortedPhases = useMemo(
    () => [...phases.rows].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date)),
    [phases.rows],
  )
  const t = today()
  const currentPhase = sortedPhases.find((p) => p.start_date <= t && t <= p.end_date)
    ?? sortedPhases.find((p) => p.start_date > t) ?? sortedPhases[sortedPhases.length - 1]

  // Which phases are expanded: the current one by default, reset when switching projects.
  if (openFor !== id) { setOpenFor(id); setOpenIds(null) }
  const open = openIds ?? new Set(currentPhase ? [currentPhase.id] : [])
  const toggle = (pid: string) => {
    const next = new Set(open)
    if (next.has(pid)) next.delete(pid)
    else next.add(pid)
    setOpenIds(next)
  }

  const tasksFor = (phaseId: string | null) =>
    tasks.rows
      .filter((x) => x.phase_id === phaseId)
      .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done')
        || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.sort_order - b.sort_order)
  const unphased = tasksFor(null)

  if (projects.loading) return <p className="muted">Loading…</p>
  if (!project) return <p>No project chosen. <Link to="/">See all projects</Link></p>

  const staff = people.rows.filter((p) => p.kind === 'staff')
  const tree = buildTree(tasks.rows)
  const work = (rows: Task[]) => rows.filter((x) => !x.is_milestone && isWorkLeaf(tree, x))
  const openTaskRows = work(tasks.rows).filter((x) => x.status !== 'done')
  const start = minDate(phases.rows.map((p) => p.start_date))
  const end = maxDate(phases.rows.map((p) => p.end_date))
  const nextMilestone = tasks.rows.filter((x) => x.is_milestone && x.due_date && x.due_date >= t).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]

  async function addPhase() {
    const last = sortedPhases[sortedPhases.length - 1]
    const s = last ? addDays(last.end_date, 1) : nextMonday()
    const p = await phases.add({ project_id: id, name: 'New phase', sort_order: (last?.sort_order ?? -1) + 1, start_date: s, end_date: addDays(s, 27), client_visible: true })
    setOpenIds(new Set([...open, p.id]))
  }

  async function deleteProject() {
    if (!window.confirm(`Delete "${project?.name}" with all its phases and tasks? This can't be undone.`)) return
    await projects.drop(id)
    navigate('/')
  }

  async function deletePhase(p: Phase) {
    const n = tasksFor(p.id).length
    if (!window.confirm(`Delete the ${p.name} phase?${n ? ` Its ${n} task(s) will move to "No phase".` : ''}`)) return
    await phases.drop(p.id)
    void tasks.reload()
  }

  function phaseItems(p: Phase): MenuItem[] {
    const filled = tasksFor(p.id).length > 0
    return [
      { label: filled ? `Add suggested work to ${p.name}…` : `Set up ${p.name}…`, run: () => setSetupLocal(p.id) },
      { label: 'Rename', run: () => { setOpenIds(new Set(open)); setRenaming(p.id) } },
      { label: 'Change dates…', run: () => setEditingPhase(p.id) },
      { label: p.client_visible ? 'Hide from presentation view' : 'Show in presentation view', run: () => void phases.patch(p.id, { client_visible: !p.client_visible }) },
      'sep',
      { label: 'Add phase after', run: () => void addPhaseAfter(p) },
      'sep',
      { label: 'Delete phase', danger: true, run: () => void deletePhase(p) },
    ]
  }

  async function addPhaseAfter(p: Phase) {
    const later = sortedPhases.filter((x) => x.sort_order > p.sort_order)
    for (const x of later) void phases.patch(x.id, { sort_order: x.sort_order + 1 })
    const s = addDays(p.end_date, 1)
    const n = await phases.add({ project_id: id, name: 'New phase', sort_order: p.sort_order + 1, start_date: s, end_date: addDays(s, 27), client_visible: true })
    setEditingPhase(n.id)
  }

  const palette = projectPalette(project.color, sortedPhases.length, project.color_scheme)
  const phaseColor = (i: number) => palette[i]
  const { accent, soft } = projectAccent(project.color)
  const span = start && end ? Math.max(1, daysBetween(start, end) + 1) : 1

  const taskRow = (x: Task) => (
    <li key={x.id} className={`trow${x.status === 'done' ? ' done' : ''}`}>
      <button className={`tick ${x.status}`} title={x.status === 'done' ? 'Mark not done' : 'Mark done'}
        onClick={() => patchTask(x, { status: x.status === 'done' ? 'todo' : 'done' })}>
        {x.status === 'done' ? '✓' : ''}
      </button>
      {x.is_milestone && <MilestoneMark task={x} />}
      <div className="trow-title">
        <TextField value={x.title} autoFocus={x.id === newId} onSave={(v) => { if (v) patchTask(x, { title: v }, false); if (x.id === newId) setNewId(null) }}
          onEscape={x.id === newId ? () => { setNewId(null); void tasks.drop(x.id) } : undefined} />
      </div>
      <TaskControls task={x} people={people.rows} phases={phases.rows}
        onPatch={(c) => patchTask(x, c)} onDelete={() => void tasks.drop(x.id)} />
    </li>
  )

  return (
    <section className="overview" style={{ ['--p-accent' as string]: accent, ['--p-soft' as string]: soft }}>
      <Link to="/" className="back">← All projects</Link>

      <header className="project-head card">
        <div className="project-title">
          <ColorPicker value={project.color} scheme={project.color_scheme ?? null} phaseNames={sortedPhases.map((p) => p.name)}
            onChange={(c) => projects.patch(id, { color: c })} onScheme={(s) => projects.patch(id, { color_scheme: s })} />
          <TextField value={project.number} placeholder="Project no." className="mono number"
            onSave={(v) => projects.patch(id, { number: v })} />
          <TextField value={project.name} className="title" autoFocus={isNew}
            onSave={(v) => v && projects.patch(id, { name: v })} />
        </div>
        <div className="meta-grid">
          <label>Owner<TextField value={project.client} placeholder="Owner" onSave={(v) => projects.patch(id, { client: v })} /></label>
          <label>Building type<BuildingTypeField value={project.building_type ?? null} onSave={(v) => projects.patch(id, { building_type: v })} /></label>
          <label>Project manager
            <SelectField value={project.pm_id} onSave={(v) => projects.patch(id, { pm_id: v })}>
              <PersonOptions people={staff} includeConsultants={false} />
            </SelectField>
          </label>
          <label>Status
            <SelectField<ProjectStatus> value={project.status} onSave={(v) => v && projects.patch(id, { status: v })}>
              {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SelectField>
          </label>
          <label>Budget
            <AmountField value={project.budget ?? null} placeholder="e.g. 4.25m" format={money}
              onSave={(v) => projects.patch(id, { budget: v })} />
          </label>
          <label>Gross area
            <AmountField value={project.gross_area ?? null} placeholder="e.g. 12,500" format={area}
              onSave={(v) => projects.patch(id, { gross_area: v })} />
          </label>
          <div className="stat" title="Budget divided by gross area"><span>Cost per SF</span>
            {project.budget && project.gross_area ? money(project.budget / project.gross_area, 2) : <span className="muted">Add budget and area</span>}
          </div>
          <div className="stat"><span>Schedule</span>{formatDate(start)} – {formatDate(end)}
            <small className="muted">{openTaskRows.length} open task{openTaskRows.length === 1 ? '' : 's'}</small>
          </div>
        </div>
        <label className="notes">Notes<TextField multiline value={project.notes} placeholder="Scope, contract notes…" onSave={(v) => projects.patch(id, { notes: v })} /></label>
      </header>

      {[projects.error, phases.error, tasks.error].filter(Boolean).map((e) => <p key={e} className="error">{e}</p>)}

      {/* Where the project is: all phases at a glance */}
      {sortedPhases.length > 0 && start && (
        <div className="phase-strip">
          <div className="strip-bar">
            {sortedPhases.map((p, i) => (
              <button key={p.id} className={`strip-seg${p.id === currentPhase?.id ? ' now' : ''}${p.end_date < t ? ' past' : ''}`}
                style={{ flexGrow: daysBetween(p.start_date, p.end_date) + 1, background: phaseColor(i), color: textOn(phaseColor(i)) }}
                title={`${p.name}: ${shortDate(p.start_date)} – ${shortDate(p.end_date)}`}
                onClick={() => { setOpenIds(new Set([...open, p.id])); document.getElementById(`phase-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>
                <span>{p.name}</span>
              </button>
            ))}
            {t >= start && end && t <= end && <i className="strip-today" style={{ left: `${(daysBetween(start, t) / span) * 100}%` }} />}
          </div>
          <div className="strip-foot muted small">
            <span>{currentPhase ? <>Now in <strong>{currentPhase.name}</strong>, through {formatDate(currentPhase.end_date)}</> : ''}</span>
            {nextMilestone && <span>Next milestone: <strong>{nextMilestone.title}</strong>, {formatDate(nextMilestone.due_date)}</span>}
          </div>
        </div>
      )}

      <div className="phase-list">
        {sortedPhases.map((p, i) => {
          const leaves = work(tasksFor(p.id))
          const done = leaves.filter((x) => x.status === 'done').length
          const openCount = leaves.length - done
          const isOpen = open.has(p.id)
          const isNow = p.id === currentPhase?.id && p.start_date <= t
          return (
            <div key={p.id} id={`phase-${p.id}`} className={`phase-sec${isOpen ? ' open' : ''}${p.end_date < t ? ' past' : ''}`}>
              <div className="phase-row" role="button" tabIndex={0} onClick={() => toggle(p.id)} aria-expanded={isOpen}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggle(p.id) } }}
                onContextMenu={(e) => { e.preventDefault(); setPhaseMenu({ x: e.clientX, y: e.clientY, phase: p }) }}>
                <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="dot" style={{ background: phaseColor(i) }} />
                {renaming === p.id ? (
                  <span className="phase-title" onClick={(e) => e.stopPropagation()}>
                    <TextField value={p.name} autoFocus className="phase-name-edit"
                      onSave={(v) => { if (v) void phases.patch(p.id, { name: v }); setRenaming(null) }}
                      onEscape={() => setRenaming(null)} />
                  </span>
                ) : (
                  <span className="phase-title" title="Double-click to rename" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(p.id) }}>{p.name}</span>
                )}
                {isNow && <span className="chip">Current</span>}
                <span className="phase-sum">
                  <span className="muted">{shortDate(p.start_date)} – {shortDate(p.end_date)}</span>
                  <span className="progress" title={`${done} of ${leaves.length} done`}>
                    <i style={{ width: leaves.length ? `${(done / leaves.length) * 100}%` : 0 }} />
                  </span>
                  <span className="muted sum-text">{leaves.length ? (openCount ? `${openCount} open` : 'All done') : 'Nothing yet'}</span>
                </span>
                <span className="phase-more" role="button" tabIndex={0} title="Phase options" aria-label="Phase options"
                  onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setPhaseMenu({ x: r.right - 220, y: r.bottom + 4, phase: p }) }}>⋯</span>
              </div>
              {isOpen && (
                <div className="phase-body">
                  {tasksFor(p.id).length === 0 && (
                    <div className="phase-empty">
                      <button className="btn primary" onClick={() => setSetupLocal(p.id)}>Set up {p.name}</button>
                      <span className="muted small">Pick the usual tasks, milestones and sheets for this phase in one go, or right-click below to add one thing at a time.</span>
                    </div>
                  )}
                  <PlanTree phase={p} tree={tree} phases={phases.rows} people={people.rows} projectId={id}
                    onPatch={patchTask} onPatchMany={patchMany}
                    presented={(x) => isPresented(rulesOf(project), x)}
                    onTogglePresented={(x) => { const c = togglePresented(rulesOf(project), x); if (c.task) patchTask(x, c.task); if (c.rules) void projects.patch(id, { presentation: c.rules }) }}
                    onDrop={(tid) => void tasks.drop(tid)} onAdd={tasks.add}
                    onAddMany={async (rows) => { await insertMany<Task>('tasks', rows); await tasks.reload() }} />
                </div>
              )}
            </div>
          )
        })}

        {unphased.length > 0 && (
          <div className="phase-sec open">
            <div className="phase-row static"><span className="phase-title">No phase</span></div>
            <div className="phase-body"><ul className="tlist">{unphased.filter((x) => !x.parent_id).map(taskRow)}</ul></div>
          </div>
        )}
      </div>

      <div className="footer-actions">
        <button className="btn" onClick={addPhase}>+ Add phase</button>
        <button className="btn danger" onClick={deleteProject}>Delete project</button>
      </div>

      {phaseMenu && (
        <ContextMenu x={phaseMenu.x} y={phaseMenu.y} onClose={() => setPhaseMenu(null)} items={phaseItems(phaseMenu.phase)} />
      )}
      {editingPhase && (() => {
        const ph = phases.rows.find((x) => x.id === editingPhase)
        return ph ? (
          <PhaseEditor phase={ph} taskCount={tasksFor(ph.id).length} onPatch={(c) => void phases.patch(ph.id, c)}
            onDelete={() => { void phases.drop(ph.id).then(() => tasks.reload()) }} onClose={() => setEditingPhase(null)} />
        ) : null
      })()}
      {setupId && (() => {
        const ph = phases.rows.find((x) => x.id === setupId)
        if (!ph) return null
        const taken = new Set(tasks.rows.filter((x) => x.kind === 'sheet' && x.sheet_number).map((x) => x.sheet_number!.toUpperCase()))
        const top = tasks.rows.filter((x) => x.phase_id === ph.id && !x.parent_id)
        return (
          <PhaseSetupDialog phase={ph} projectId={id} takenNumbers={taken}
            startOrder={top.reduce((m, x) => Math.max(m, x.sort_order), top.length - 1) + 1}
            onCreate={async (rows) => { await insertMany<Task>('tasks', rows); await tasks.reload(); setOpenIds(new Set([...open, ph.id])) }}
            onClose={closeSetup} />
        )
      })()}
    </section>
  )
}

/** Building type: the usual list, or type your own under Other. */
function BuildingTypeField({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const known = !value || BUILDING_TYPES.includes(value)
  const [other, setOther] = useState(!known)
  if (other) {
    return <TextField value={value} placeholder="Building type" autoFocus={known} onSave={(v) => { onSave(v); if (!v) setOther(false) }} onEscape={() => setOther(false)} />
  }
  return (
    <select className="field" value={value ?? ''} onChange={(e) => {
      if (e.target.value === '__other') { setOther(true); return }
      onSave(e.target.value || null)
    }}>
      <option value="">Not set</option>
      {BUILDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      <option value="__other">Other…</option>
    </select>
  )
}
