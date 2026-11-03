import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import BoardView, { type BoardGroup } from '../components/BoardView.tsx'
import CalendarView from '../components/CalendarView.tsx'
import ScheduleChart, { type ChartMode } from '../components/ScheduleChart.tsx'
import { chartColors, useTheme } from '../lib/theme.ts'
import TaskEditor from '../components/TaskEditor.tsx'
import { FIRM_NAME } from '../lib/brand.ts'
import { projectPalette } from '../lib/colors.ts'
import { addDays, parseISO, toISO, today } from '../lib/dates.ts'
import { useProject } from '../lib/projectContext.ts'
import type { Task } from '../lib/types.ts'
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
  const [levelStr, setLevelStr] = useSaved<'1' | '2' | '3'>('archmgmt.detailLevel', '3')
  const level = Number(levelStr) as DetailLevel
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newTaskId, setNewTaskId] = useState<string | null>(null)
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
      <input type="range" min={1} max={3} step={1} value={level} aria-label="Detail level"
        onChange={(e) => setLevelStr(e.target.value as '1' | '2' | '3')} />
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
                ? `Drag a bar to move it, drag its ends to change length. Moving a phase moves its tasks. Click a task to edit it.${months ? ' Click and hold empty space to pan.' : ''}`
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
              onOpenTask={openTask} />
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
            onShiftTask={(t, d) => plan.shiftTask(real(t), d)} onOpenTask={openTask} />
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
