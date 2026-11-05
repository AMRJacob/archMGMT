import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BoardView, { type BoardGroup } from '../components/BoardView.tsx'
import CalendarView from '../components/CalendarView.tsx'
import ScheduleChart, { type ChartMode, type ChartSpot } from '../components/ScheduleChart.tsx'
import ContextMenu, { type MenuItem } from '../components/ContextMenu.tsx'
import { kindUnder, moveTo } from '../lib/treeEdit.ts'
import { isPresented, ruleMatch, rulesOf, togglePresented, type PresentationRules } from '../lib/presentation.ts'
import PresentationFilter from '../components/PresentationFilter.tsx'
import { chartColors, useTheme } from '../lib/theme.ts'
import TaskEditor from '../components/TaskEditor.tsx'
import { useNotes } from '../lib/useNotes.tsx'
import PhaseEditor from '../components/PhaseEditor.tsx'
import ProjectTeam from '../components/ProjectTeam.tsx'
import { FIRM_NAME } from '../lib/brand.ts'
import ExportPreview, { renderPng, type ExportSettings } from '../components/ExportPreview.tsx'
import { brandOnlyProject, EXPORT_BGS, exportColors, paletteOf, PAGE_MARGIN, pageOf, type ExportBg, type ExportFit, type ExportPage } from '../lib/exportLook.ts'
import { phaseColors } from '../lib/colors.ts'
import { addDays, daysBetween, maxDate, minDate, parseISO, shortDate, toISO, today } from '../lib/dates.ts'
import { useProject } from '../lib/projectContext.ts'
import { BRAND_ROLES, KIND_RANK, type BrandPalette, type BrandRoles, type Phase, type Task } from '../lib/types.ts'
import { useRows } from '../lib/data.ts'
import { useProjectPlan } from '../lib/useProjectPlan.ts'
import { mondayOf } from '../lib/workload.ts'
import { asShown, buildTree, DETAIL_LEVELS, movedBy, passesWork, visibleAtLevel, type DetailLevel, type ShownTask, type WorkFilter } from '../lib/tree.ts'

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
  const onBoardPage = useLocation().pathname === '/board'
  const navigate = useNavigate()
  const { current: project, patch: patchProject } = useProject()
  const theme = useTheme()
  const plan = useProjectPlan(project?.id ?? '')
  const { phases, tasks, people } = plan
  const nh = useNotes(project?.id ?? '', tasks.rows, phases.rows, people.rows, () => void tasks.reload())
  const [savedView, setSavedView] = useSaved<View>('archmgmt.scheduleView', 'timeline')
  // The Board has its own place in the sidebar (/board); Schedule shows the timeline or calendar.
  const view: View = onBoardPage ? 'board' : savedView === 'board' ? 'timeline' : savedView
  const setView = (v: View) => { if (v === 'board') navigate('/board'); else { setSavedView(v); if (onBoardPage) navigate('/schedule') } }
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
  const [previewing, setPreviewing] = useState(false)
  const brandPalettes = useRows<BrandPalette>('brand_palettes')
  const [work, setWork] = useSaved<WorkFilter>('archmgmt.workFilter', 'all')
  const [dayMarks, setDayMarks] = useSaved<'on' | 'off'>('archmgmt.dayMarks', 'on')
  const [xBg, setXBg] = useSaved<ExportBg>('archmgmt.exportBg', 'white')
  const [xPage, setXPage] = useSaved<ExportPage>('archmgmt.exportPage', 'letter')
  const [xFit, setXFit] = useSaved<ExportFit>('archmgmt.exportFit', 'fit')
  const xSettings: ExportSettings = { bg: xBg, page: xPage, fit: xFit }
  const setXSettings = (s: ExportSettings) => { setXBg(s.bg); setXPage(s.page); setXFit(s.fit) }
  // The on-screen timeline draws at the card's real width, so text stays normal size on wide screens.
  const [chartW, setChartW] = useState<number | undefined>(undefined)
  const chartBox = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const ro = new ResizeObserver(([e]) => setChartW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (!project) return <p>No project chosen. <Link to="/">See all projects</Link></p>

  const editing = tasks.rows.find((t) => t.id === editingId) ?? null

  // What each view shows at the chosen detail level. Parents carry their children's dates.
  const tree = buildTree(tasks.rows)
  // Show: everything, only general tasks (sheets and their views filtered out), or only sheets. Milestones always show.
  const workApplies = level > 0 && tasks.rows.some((t) => t.kind === 'sheet' || t.kind === 'view')
  const shown = visibleAtLevel(tree, level).filter((v) => !workApplies || passesWork(tree, v.task, work))
  const treeRows: ShownTask[] = shown.map((v) => asShown(tree, v.task, v.depth))
  const frontierRows: ShownTask[] = shown.filter((v) => v.frontier).map((v) => asShown(tree, v.task, v.depth))
  const real = (t: Task) => tree.byId.get(t.id) ?? t

  // Presentation view: rules (milestones, sheets, top-level tasks) plus hand-picked items, minus hidden ones.
  const rules = rulesOf(project)
  const setRules = (r: PresentationRules) => void patchProject(project.id, { presentation: r })
  const presented = (t: Task) => isPresented(rules, real(t))
  const togglePres = (t: Task) => {
    const c = togglePresented(rules, real(t))
    if (c.task) plan.patchTask(real(t), c.task)
    if (c.rules) setRules(c.rules)
  }
  // Presentation view has its own Show rules, so the Detail slider and the General Tasks / Sheets filter don't apply.
  const chartRows: ShownTask[] = mode === 'presentation'
    ? visibleAtLevel(tree, 3).map((v) => asShown(tree, v.task, 0))
    : treeRows
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

  // Grey out the filters wherever they'd do nothing:
  //  - Presentation view (timeline) has its own Show rules, so neither the Detail slider nor the work filter applies.
  //  - The General Tasks / Sheets filter does nothing at Detail "Phases" (only phases and milestones show) or
  //    when the project has no sheets.
  const levelOff = view === 'timeline' && mode === 'presentation'
  const hasSheets = tasks.rows.some((t) => t.kind === 'sheet' || t.kind === 'view')
  const workOff = levelOff || level === 0 || !hasSheets
  const workWhy = levelOff ? 'Presentation view uses its own Show rules (on the left); switch to Working view to use this.'
    : level === 0 ? 'Only phases and milestones show at this detail level, so there are no tasks or sheets to filter.'
    : !hasSheets ? 'This project has no sheets yet, so everything is a general task.' : undefined
  // In presentation view neither control ever applies, so they're left out; elsewhere they're greyed out when idle.
  const levelControl = levelOff ? null : (
    <>
    <span className={`level-group${workOff ? ' off' : ''}`} aria-disabled={workOff} title={workWhy}>
    <div className="segmented small-seg" aria-label="Show" title={workOff ? undefined : 'Show everything, only general tasks, or only sheets (milestones always show)'}>
      {([['all', 'All'], ['tasks', 'General Tasks'], ['sheets', 'Sheets']] as [WorkFilter, string][]).map(([w, label]) => (
        <button key={w} className={work === w ? 'on' : ''} onClick={() => setWork(w)}>{label}</button>
      ))}
    </div>
    </span>
    <span className={`level-group${levelOff ? ' off' : ''}`} aria-disabled={levelOff}
      title={levelOff ? 'Presentation view uses its own Show rules (on the left); switch to Working view to use this.' : undefined}>
    <div className="level-ctl" title="How much detail to show">
      <span className="muted small">Detail</span>
      <input type="range" min={0} max={3} step={1} value={level} aria-label="Detail level"
        disabled={levelOff} onChange={(e) => setLevelStr(e.target.value as '0' | '1' | '2' | '3')} />
      <span className="level-name">{DETAIL_LEVELS.find((l) => l.value === level)?.label}</span>
    </div>
    </span>
    </>
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
    // With no date (the "+ Add task" rows), it starts undated: the user clicks in its row to place it.
    const parent = opts.parent ? real(opts.parent) : null
    const kind = parent ? kindUnder(parent, 'task') : 'task'
    return addTask({
      phase_id: parent?.phase_id ?? phase?.id ?? null, parent_id: parent?.id ?? null, kind,
      title: opts.milestone ? 'New milestone' : 'New task',
      is_milestone: Boolean(opts.milestone), client_visible: Boolean(opts.milestone),
      start_date: date && !opts.milestone ? date : null, due_date: date ? (opts.milestone ? date : addDays(date, 4)) : null,
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
      ...(!task && sp.phase ? [
        'sep' as const,
        { label: sp.phase.client_visible ? 'Hide phase from presentation' : 'Show phase in presentation', run: () => void phases.patch(sp.phase!.id, { client_visible: !sp.phase!.client_visible }) },
        { label: `Rename or change dates of ${sp.phase.name}…`, run: () => setPhaseEdit(sp.phase!.id) },
      ] : []),
      ...(task ? [
        'sep' as const,
        { label: `Open “${task.title.slice(0, 30)}”`, run: () => openTask(task) },
        { label: presented(task) ? 'Hide from presentation' : 'Show in presentation', run: () => togglePres(task) },
        { label: task.is_milestone ? 'Add meeting notes' : 'Add notes', run: () => void nh.add(task) },
        ...(nh.forTask(task).length ? [{ label: `Open notes (${nh.forTask(task).length})`, run: () => { const n = nh.latestFor(task); if (n) nh.open(n.id) } }] : []),
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
      const blob = await renderPng(el, xSettings, xColors.bg)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${fileBase}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } finally {
      setSaving(false)
    }
  }

  /** Print to PDF with this export's paper size; the page margin is drawn by the print area so the background reaches the edge. */
  function printPdf() {
    const pg = pageOf(xPage)
    const style = document.createElement('style')
    style.textContent = `@page { size: ${pg.w}in ${pg.h}in; margin: 0; }`
    document.head.appendChild(style)
    const done = () => { style.remove(); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    window.print()
  }

  const months = zoom === 'all' ? 0 : Number(zoom)
  const chartWindow: [string, string] | undefined = months
    ? [winStart, addDays(addMonths(winStart, months), -1)]
    : undefined
  const step = Math.round((months * 30) / 4) // arrows move a quarter of the view
  // The whole project's span, for the scroll bar under a zoomed timeline.
  const allDates = [...phases.rows.flatMap((p) => [p.start_date, p.end_date]), ...tasks.rows.flatMap((t) => [t.start_date, t.due_date])].filter((d): d is string => Boolean(d))
  const spanStart = minDate(allDates), spanEnd = maxDate(allDates)
  const winDays = chartWindow ? daysBetween(chartWindow[0], chartWindow[1]) : 0
  const scrollMax = spanStart && spanEnd ? Math.max(0, daysBetween(spanStart, spanEnd) - winDays + 14) : 0

  // One colour per phase, in phase order (each phase keeps its own colour when phases are reordered).
  const colorOf = phaseColors(project, phases.rows)
  const xColors = exportColors(project, xBg, paletteOf(project, brandPalettes.rows))
  // "Brand palette": phases use the brand colours exactly. Presentation view on screen shows the printed look.
  const xProject = xBg === 'brand' ? brandOnlyProject(project) : project
  const pres = mode === 'presentation'
  // Custom presentation colours, kept on the project so everyone's exports match.
  const custom = project.export_colors ?? {}
  const setCustom = (k: keyof BrandRoles, v: string | null) => {
    const next: BrandRoles = { ...custom }
    if (v) next[k] = v; else delete next[k]
    void patchProject(project.id, { export_colors: next })
  }
  const auto: Record<keyof BrandRoles, string> = { background: xColors.bg, band: xColors.band, accent: xColors.accent, text: xColors.ink }
  const customControls = (
    <span className="custom-colors" title="Custom presentation colours for this project">
      {BRAND_ROLES.map((r) => (
        <label key={r.key} className="cc-pick" title={`${r.label}: ${r.hint}${custom[r.key] ? '' : ' (automatic)'}`}>
          <input type="color" value={custom[r.key] ?? auto[r.key]}
            onChange={(e) => setCustom(r.key, e.target.value)} />
          <span>{r.label}</span>
          {custom[r.key] && <button className="icon-btn" title="Back to automatic" onClick={(e) => { e.preventDefault(); setCustom(r.key, null) }}>×</button>}
        </label>
      ))}
    </span>
  )
  const palette = [...phases.rows].sort((a, b) => a.sort_order - b.sort_order).map((p) => colorOf.get(p.id)!)


  return (
    <section className="schedule-page">
      <header className="page-head no-print">
        <div>
          <h1>{onBoardPage ? 'Board' : 'Schedule'}</h1>
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
            {mode === 'working' ? (
              <span className="muted small grow">
                {`Right-click or double-click a spot to add a task there; right-click an item to show it in the presentation. Drag bars and milestones to move them.${months ? ' Scroll sideways, use the bar below, or click and hold empty space to move through time.' : ''}`}
              </span>
            ) : (
              <PresentationFilter rules={rules} onChange={setRules}
                picked={tasks.rows.filter((t) => t.client_visible && !ruleMatch(rules, t)).length}
                hiddenPhases={phases.rows.filter((p) => !p.client_visible).length} />
            )}
            {levelControl}
            {mode === 'presentation' && (
              <select className="field boxed small-select" value={xBg} title="Colours for the presentation view, PDF and PNG" aria-label="Presentation colours"
                onChange={(e) => setXBg(e.target.value as ExportBg)}>
                {EXPORT_BGS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {mode === 'presentation' && xBg === 'custom' && customControls}
            <button className="btn" onClick={() => setPreviewing(true)} title="See the PDF / PNG pages and choose paper, background and fit">Preview…</button>
            <button className="btn" onClick={downloadPng} disabled={saving}>Download PNG</button>
            <button className="btn primary" onClick={printPdf}>Save as PDF</button>
          </div>
          <div className="zoombar no-print">
            <span className="muted small">Zoom</span>
            <div className="segmented small-seg" aria-label="Zoom">
              {([['all', 'Whole project'], ['12', '12 months'], ['6', '6 months'], ['3', '3 months']] as [Zoom, string][]).map(([z, label]) => (
                <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{label}</button>
              ))}
            </div>
            {months === 3 && (
              <label className="inline-check" title="A line and weekday letter for every day, with weekends shaded. Off: Mondays only.">
                <input type="checkbox" checked={dayMarks === 'on'} onChange={(e) => setDayMarks(e.target.checked ? 'on' : 'off')} />
                Day marks
              </label>
            )}
            {months > 0 && (
              <div className="toolbar">
                <button className="btn small-btn" onClick={() => setWinStart(addDays(winStart, -step))} title="Earlier">‹</button>
                <button className="btn small-btn" onClick={() => setWinStart(defaultWindowStart())}>Today</button>
                <button className="btn small-btn" onClick={() => setWinStart(addDays(winStart, step))} title="Later">›</button>
              </div>
            )}
            {months > 0 && spanStart && scrollMax > 0 && (
              <div className="chart-scroll">
                <span className="muted small">{shortDate(spanStart)}</span>
                <input type="range" min={-7} max={scrollMax} step={1} aria-label="Scroll the timeline"
                  value={Math.min(scrollMax, Math.max(-7, daysBetween(spanStart, winStart)))}
                  onChange={(e) => setWinStart(addDays(spanStart, Number(e.target.value)))} />
                <span className="muted small">{shortDate(spanEnd)}</span>
              </div>
            )}
          </div>
          <div className="card chart-card no-print" ref={chartBox}>
            <ScheduleChart project={pres ? xProject : project} phases={phases.rows} tasks={chartRows} people={people.rows} mode={mode} presented={presented}
              firmName={FIRM_NAME} editable window={chartWindow} dayMarks={dayMarks === 'on'} width={chartW} colors={pres ? xColors : chartColors(theme)} showHeader={false} keepOrder
              onPan={months ? (d) => setWinStart((w) => addDays(w, d)) : undefined}
              onMovePhase={plan.movePhase}
              onMoveTask={(t, s, d) => moveShown(t as ShownTask, s, d)}
              onOpenTask={openTask}
              onReorder={(t, target, at) => { const c = moveTo(tree, real(t), real(target), at, target.phase_id); if (c.length) plan.patchMany(c) }}
              onAddAt={(ph, d) => void addHere(ph, d)}
              onContextAt={(sp) => setSpot(sp)} />
          </div>
          <p className="muted small no-print">
            “Save as PDF” opens the print dialog: choose <strong>Save as PDF</strong> as the printer. Exports use {pageOf(xPage).name.split(' (')[0].toLowerCase()} paper,
            {xFit === 'fit' ? ' fitted to one page' : ' fitted to width'}{xBg === 'white' ? '' : `, ${xBg === 'tint' ? 'brand tint' : xBg === 'dark' ? 'brand dark' : xBg === 'custom' ? 'custom' : 'brand palette'} background`}; change these in Preview.
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
              <button className={group === 'week' ? 'on' : ''} onClick={() => setGroup('week')}>By week</button>
              <button className={group === 'person' ? 'on' : ''} onClick={() => setGroup('person')}>By person</button>
            </div>
            <span className="muted small grow">
              {group === 'person'
                ? 'Hand out work: drag a note from Unassigned (or from one person) onto someone.'
                : group === 'week'
                ? 'Pull-plan board: drag a note to another week to move its dates.'
                : `Drag a card to another column to change its ${group}. Click a card to edit it.`}
            </span>
            {levelControl}
          </div>
          <BoardView group={group} phases={phases.rows} tasks={frontierRows} people={people.rows} palette={palette}
            team={project.team ?? []}
            onTeam={(team) => void patchProject(project.id, { team })}
            sheetOf={(t) => { let cur: Task | undefined = real(t); for (let i = 0; cur && i < 12; i++) { if (cur.kind === 'sheet') return cur; cur = cur.parent_id ? tree.byId.get(cur.parent_id) : undefined } return null }}
            teamBar={<><span className="team-label">Project team</span><ProjectTeam project={project} people={people.rows} compact onChange={(team) => void patchProject(project.id, { team })} /></>}
            onPatch={(t, c) => patchShown(t as ShownTask, c)} onOpenTask={openTask} onAdd={addTask} />
        </>
      )}

      {/* What PDF and PNG exports use: the timeline, not editable, in the chosen view. */}
      <div className={`print-area export-only sched-export${xFit === 'fit' ? ' fit' : ''}`} aria-hidden="true"
        style={{ '--pbg': xColors.bg, '--ph': `${pageOf(xPage).h}in`, '--pm': `${PAGE_MARGIN}in` } as CSSProperties}>
        <ScheduleChart project={xProject} phases={phases.rows} tasks={chartRows} people={people.rows} mode={mode} presented={presented}
          firmName={FIRM_NAME} svgRef={exportSvg} keepOrder colors={xColors} />
      </div>
      {previewing && (
        <ExportPreview svg={exportSvg} settings={xSettings} customControls={xBg === 'custom' ? customControls : undefined} onSettings={setXSettings} bgColor={xColors.bg} saving={saving}
          onClose={() => setPreviewing(false)} onPng={() => void downloadPng()} onPdf={() => { setPreviewing(false); setTimeout(printPdf, 50) }} />
      )}

      {phaseEdit && (() => {
        const ph = phases.rows.find((x) => x.id === phaseEdit)
        return ph ? (
          <PhaseEditor phase={ph} taskCount={tasks.rows.filter((x) => x.phase_id === ph.id).length}
            onPatch={(c) => void phases.patch(ph.id, c)} onDelete={() => { void phases.drop(ph.id).then(() => tasks.reload()) }}
            onClose={() => setPhaseEdit(null)} />
        ) : null
      })()}
      {nh.editor}
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
