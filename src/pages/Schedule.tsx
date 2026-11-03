import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BoardView, { type BoardGroup } from '../components/BoardView.tsx'
import CalendarView from '../components/CalendarView.tsx'
import ScheduleChart, { type ChartMode, type ChartSpot } from '../components/ScheduleChart.tsx'
import ContextMenu, { type MenuItem } from '../components/ContextMenu.tsx'
import { kindUnder } from '../lib/treeEdit.ts'
import { chartColors, useTheme } from '../lib/theme.ts'
import TaskEditor from '../components/TaskEditor.tsx'
import PhaseEditor from '../components/PhaseEditor.tsx'
import { FIRM_NAME } from '../lib/brand.ts'
import { projectPalette } from '../lib/colors.ts'
import { addDays, parseISO, toISO, today } from '../lib/dates.ts'
import { useProject } from '../lib/projectContext.ts'
import { KIND_RANK, type Phase, type Task } from '../lib/types.ts'
import { useProjectPlan } from '../lib/useProjectPlan.ts'
import { mondayOf } from '../lib/workload.ts'
import { asShown, buildTree, DETAIL_LEVELS, movedBy, visibleAtLevel, type DetailLevel, type ShownTask } from '../lib/tree.ts'

type View = 'timeline' | 'calendar' | 'board'
type Zoom = 'all' | '12' | '6' | '3'

/** The same day n months later (or earlier). */
function addMonths(iso: string, n: number) {
  const d = parseISO(iso)
  return toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())))
}

/** Where a zoomed timeline starts by default: two weeks before this week. */
const defaultWindowStart = () => addDays(mondayOf(today()), -14)

function useSaved<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { return (localStorage.getItem(key) as T) || initial } catch { return initial }
  })
  return [v, (next: T) => { setV(next); try { localStorage.setItem(key, next) } catch { /* ignore */ } }]
}

export default function Schedule() {
  const { current: project } = useProject()
  const theme = useTheme()
  const plan = useProjectPlan(project?.id ?? '')
  const { phases, tasks, people } = plan
  const [view, setView] = useSaved<View>('archmgmt.scheduleView', 'timeline')
  const [mode, setMode] = useSaved<ChartMode>('archmgmt.chartMode', 'working')
  const [group, setGroup] = useSaved<BoardGroup>('archmgmt.boardGroup', 'status')
  const [zoom, setZoom] = useSaved<Zoom>('archmgmt.timelineZoom', 'all')
  const [winStart, setWinStart] = useState(defaultWindowStart)
  const [levelStr, setLevelStr] = useSaved<'0' | '1' | '2' | '3'>('archmgmt.detailLevel', '3')
  const level = Number(levelStr) as DetailLevel
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTaskId, setNewTaskId] = useState<string | null>(null)
  const [phaseEdit, setPhaseEdit] = useState<string | null>(null)
  const [spot, setSpot] = useState<(Omit<ChartSpot, 'phase'> & { phase: Phase | null }) | null>(null)
  const exportSvg = useRef<SVGSVGElement | null>(null)
  const [saving, setSaving] = useState(false)

  if (!project) return <p>No project chosen. <Link to="/">See all projects</Link></p>

  const editing = tasks.rows.find((t) => t.id === editingId) ?? null

  // What each view shows at the chosen detail level. Parents carry their children's dates.
  const tree = buildTree(tasks.rows)
  const shown = visibleAtLevel(tree, level)
  const treeRows: ShownTask[] = shown.map((v) => asShown(tree, v.task, v.depth))
  const frontierRows: ShownTask[] = shown.filter((v) => v.frontier).map((v) => asShown(tree, v.task, v.depth))
  const real = (t: Task) => tree.byId.get(t.id) ?? t
  /** A drag on a shown copy: whole branches move together; plain tasks take the new dates. */
  const moveShown = (t: ShownTask, s: string | null, d: string | null) => {
    if (t._rolled) plan.shiftTask(real(t), movedBy(t, s, d))
    else plan.patchTask(real(t), { start_date: s, due_date: d })
  }
  const patchShown = (t: ShownTask, c: Partial<Task>) => {
    if (t._rolled && ('due_date' in c || 'start_date' in c)) {
      const { start_date, due_date, ...rest } = c
      plan.shiftTask(real(t), movedBy(t, start_date ?? t.start_date, due_date ?? t.due_date))
      if (Object.keys(rest).length) plan.patchTask(real(t), rest)
    } else plan.patchTask(real(t), c)
  }
  const openTask = (t: Task) => { setEditingId(t.id); setNewTaskId(null) }

  const levelControl = (
    <div className="level-ctl" title="How much detail to show">
      <span className="muted small">Detail</span>
      <input type="range" min={0} max={3} step={1} value={level} aria-label="Detail level"
        onChange={(e) => setLevelStr(e.target.value as '0' | '1' | '2' | '3')} />
      <span className="level-name">{DETAIL_LEVELS.find((l) => l.value === level)?.label}</span>
    </div>
  )
  const fileBase = `${[project.number, project.name].filter(Boolean).join(' ')} schedule ${today()}`.replace(/[\\/:*?"<>|]/g, '')

  async function addTask(defaults: Partial<Task>) {
    const t = today()
    const phase = phases.rows.find((p) => p.start_date <= t && t <= p.end_date) ?? phases.rows[0]
    const start = mondayOf(t)
    const created = await tasks.add({
      project_id: project!.id, phase_id: phase?.id ?? null, title: 'New task', assignee_id: null,
      start_date: start, due_date: addDays(start, 4), estimated_hours: null, effort: 2, status: 'todo',
      is_milestone: false, client_visible: false, sort_order: tasks.rows.length, ...defaults,
    })
    setEditingId(created.id)
    setNewTaskId(created.id)
  }

  /** The phase a day falls in (or the nearest one), for adding from the calendar. */
  const phaseOn = (d: string): Phase | null => {
    const sorted = [...phases.rows].sort((a, b) => a.start_date.localeCompare(b.start_date))
    return sorted.find((p) => p.start_date <= d && d <= p.end_date) ?? sorted.filter((p) => p.start_date <= d).pop() ?? sorted[0] ?? null
  }

  /**
   * Add at a spot: a task (a week long) or a milestone on a date, in a phase, optionally under a sheet or
   * view. With no date it starts this week if the phase is under way, otherwise when the phase starts.
   */
  function addHere(phase: Phase | null, date: string | null, opts: { milestone?: boolean; parent?: Task | null } = {}) {
    const t = today()
    const inPhase = phase && phase.start_date <= t && t <= phase.end_date
    const d = date ?? (phase ? (inPhase ? mondayOf(t) : phase.start_date) : mondayOf(t))
    const parent = opts.parent ? real(opts.parent) : null
    const kind = parent ? kindUnder(parent, 'task') : 'task'
    return addTask({
      phase_id: parent?.phase_id ?? phase?.id ?? null, parent_id: parent?.id ?? null, kind,
      title: opts.milestone ? 'New milestone' : 'New task',
      is_milestone: Boolean(opts.milestone), client_visible: Boolean(opts.milestone),
      start_date: opts.milestone ? null : d, due_date: opts.milestone ? d : addDays(d, 4),
      effort: opts.milestone ? null : 2,
      ...(parent ? { assignee_ids: parent.assignee_ids ?? [], assignee_id: parent.assignee_id } : {}),
    })
  }

  function spotItems(sp: NonNullable<typeof spot>): MenuItem[] {
    const day = sp.date ? parseISO(sp.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
    const where = sp.phase ? ` in ${sp.phase.name}` : ''
    const task = sp.task ? real(sp.task) : null
    const holds = task && !task.is_milestone && KIND_RANK[task.kind ?? 'task'] < 3
    return [
      { label: day ? `Add task on ${day}` : `Add task${where}`, run: () => void addHere(sp.phase, sp.date) },
      { label: day ? `Add milestone on ${day}` : `Add milestone${where}`, run: () => void addHere(sp.phase, sp.date, { milestone: true }) },
      ...(holds ? [{ label: `Add task under “${task.title.slice(0, 28)}”`, run: () => void addHere(sp.phase, sp.date, { parent: task }) }] : []),
      ...(!task && sp.phase ? ['sep' as const, { label: `Rename or change dates of ${sp.phase.name}…`, run: () => setPhaseEdit(sp.phase!.id) }] : []),
      ...(task ? [
        'sep' as const,
        { label: `Open “${task.title.slice(0, 30)}”`, run: () => openTask(task) },
        { label: task.status === 'done' ? 'Mark not done' : 'Mark done', run: () => plan.patchTask(task, { status: task.status === 'done' ? 'todo' : 'done' }) },
        { label: 'Delete', danger: true, run: () => { if (window.confirm(`Delete "${task.title}"?`)) void tasks.drop(task.id) } },
      ] : []),
    ]
  }

  async function downloadPng() {
    const el = exportSvg.current
    if (!el) return
    setSaving(true)
    try {
      const [, , w, h] = el.getAttribute('viewBox')!.split(' ').map(Number)
      const markup = new XMLSerializer().serializeToString(el)
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('Could not draw the schedule')); img.src = url })
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
      if (!blob) throw new Error('Could not create the image')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${fileBase}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } finally {
      setSaving(false)
    }
  }

  const months = zoom === 'all' ? 0 : Number(zoom)
  const chartWindow: [string, string] | undefined = months
    ? [winStart, addDays(addMonths(winStart, months), -1)]
    : undefined
  const step = Math.round((months * 30) / 4) // arrows move a quarter of the view

  const palette = projectPalette(project.color, phases.rows.length, project.color_scheme)

  const hiddenCount = tasks.rows.filter((t) => !t.client_visible).length + phases.rows.filter((p) => !p.client_visible).length

  return (
    <section className="schedule-page">
      <header className="page-head no-print">
        <div>
          <h1>Schedule</h1>
          <p className="muted">{project.number ? `${project.number} · ` : ''}{project.name}</p>
        </div>
        <div className="toolbar">
          {plan.canUndo && <button className="btn" onClick={plan.undo} title="Undo the last move (Ctrl+Z)">↶ Undo</button>}
          <div className="segmented" role="tablist" aria-label="Schedule view">
            <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>Timeline</button>
            <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>Calendar</button>
            <button className={view === 'board' ? 'on' : ''} onClick={() => setView('board')}>Board</button>
          </div>
        </div>
      </header>

      {view === 'timeline' && (
        <>
          <div className="subbar no-print">
            <div className="segmented small-seg" aria-label="Timeline style">
              <button className={mode === 'working' ? 'on' : ''} onClick={() => setMode('working')}>Working view</button>
              <button className={mode === 'presentation' ? 'on' : ''} onClick={() => setMode('presentation')}>Presentation view</button>
            </div>
            <span className="muted small grow">
              {mode === 'working'
                ? `Right-click or double-click a spot to add a task there. Drag bars to move them, their ends to change length.${months ? ' Click and hold empty space to pan.' : ''}`
                : `Only phases and tasks marked “Show in presentation view”.${hiddenCount ? ` ${hiddenCount} item${hiddenCount === 1 ? ' is' : 's are'} hidden.` : ''}`}
            </span>
            {levelControl}
            <button className="btn" onClick={downloadPng} disabled={saving}>Download PNG</button>
            <button className="btn primary" onClick={() => window.print()}>Save as PDF</button>
          </div>
          <div className="zoombar no-print">
            <span className="muted small">Zoom</span>
            <div className="segmented small-seg" aria-label="Zoom">
              {([['all', 'Whole project'], ['12', '12 months'], ['6', '6 months'], ['3', '3 months']] as [Zoom, string][]).map(([z, label]) => (
                <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{label}</button>
              ))}
            </div>
            {months > 0 && (
              <div className="toolbar">
                <button className="btn small-btn" onClick={() => setWinStart(addDays(winStart, -step))} title="Earlier">‹</button>
                <button className="btn small-btn" onClick={() => setWinStart(defaultWindowStart())}>Today</button>
                <button className="btn small-btn" onClick={() => setWinStart(addDays(winStart, step))} title="Later">›</button>
              </div>
            )}
          </div>
          <div className="card chart-card no-print">
            <ScheduleChart project={project} phases={phases.rows} tasks={treeRows} people={people.rows} mode={mode}
              firmName={FIRM_NAME} editable window={chartWindow} colors={chartColors(theme)} showHeader={false} keepOrder
              onPan={months ? (d) => setWinStart((w) => addDays(w, d)) : undefined}
              onMovePhase={plan.movePhase}
              onMoveTask={(t, s, d) => moveShown(t as ShownTask, s, d)}
              onOpenTask={openTask}
              onAddAt={(ph, d) => void addHere(ph, d)}
              onContextAt={(sp) => setSpot(sp)} />
          </div>
          <p className="muted small no-print">
            “Save as PDF” opens the print dialog: choose <strong>Save as PDF</strong> as the printer. The page is set to landscape.
          </p>
        </>
      )}

      {view === 'calendar' && (
        <div className="subbar no-print"><span className="grow" />{levelControl}</div>
      )}
      {view === 'calendar' && (
        <div className="card pad no-print">
          <CalendarView phases={phases.rows} tasks={frontierRows} people={people.rows} palette={palette}
            onShiftTask={(t, d) => plan.shiftTask(real(t), d)} onOpenTask={openTask}
            onAddOn={(d) => void addHere(phaseOn(d), d)}
            onContextAt={(sp) => setSpot({ ...sp, phase: sp.task ? phases.rows.find((p) => p.id === sp.task!.phase_id) ?? phaseOn(sp.date) : phaseOn(sp.date) })} />
        </div>
      )}

      {view === 'board' && (
        <>
          <div className="subbar no-print">
            <div className="segmented small-seg" aria-label="Board columns">
              <button className={group === 'status' ? 'on' : ''} onClick={() => setGroup('status')}>By status</button>
              <button className={group === 'phase' ? 'on' : ''} onClick={() => setGroup('phase')}>By phase</button>
              <button className={group === 'week' ? 'on' : ''} onClick={() => setGroup('week')}>By week (post-it)</button>
            </div>
            <span className="muted small grow">
              {group === 'week'
                ? 'Pull-plan board: notes are coloured by person. Drag a note to another week to move its dates.'
                : `Drag a card to another column to change its ${group}. Click a card to edit it.`}
            </span>
            {levelControl}
          </div>
          <BoardView group={group} phases={phases.rows} tasks={frontierRows} people={people.rows} palette={palette}
            onPatch={(t, c) => patchShown(t as ShownTask, c)} onOpenTask={openTask} onAdd={addTask} />
        </>
      )}

      {/* What PDF and PNG exports use: the timeline, not editable, in the chosen view. */}
      <div className="print-area export-only" aria-hidden="true">
        <ScheduleChart project={project} phases={phases.rows} tasks={treeRows} people={people.rows} mode={mode}
          firmName={FIRM_NAME} svgRef={exportSvg} keepOrder />
      </div>

      {phaseEdit && (() => {
        const ph = phases.rows.find((x) => x.id === phaseEdit)
        return ph ? (
          <PhaseEditor phase={ph} taskCount={tasks.rows.filter((x) => x.phase_id === ph.id).length}
            onPatch={(c) => void phases.patch(ph.id, c)} onDelete={() => { void phases.drop(ph.id).then(() => tasks.reload()) }}
            onClose={() => setPhaseEdit(null)} />
        ) : null
      })()}
      {spot && <ContextMenu x={spot.clientX} y={spot.clientY} items={spotItems(spot)} onClose={() => setSpot(null)} />}

      {editing && (
        <TaskEditor task={editing} phases={phases.rows} people={people.rows}
          onPatch={(c) => { plan.patchTask(editing, c, false); setNewTaskId(null) }}
          onDelete={() => void tasks.drop(editing.id)}
          isNew={editing.id === newTaskId}
          onClose={() => { setEditingId(null); setNewTaskId(null) }} />
      )}
    </section>
  )
}
