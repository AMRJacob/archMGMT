import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DateField, SelectField, TextField } from '../components/fields.tsx'
import PersonOptions from '../components/PersonOptions.tsx'
import TaskEditor from '../components/TaskEditor.tsx'
import { addDays, daysBetween, formatDate, maxDate, minDate, nextMonday, shortDate, today } from '../lib/dates.ts'
import { phaseColor } from '../lib/phases.ts'
import { useProject } from '../lib/projectContext.ts'
import { PROJECT_STATUSES, type Phase, type ProjectStatus, type Task } from '../lib/types.ts'
import { useProjectPlan } from '../lib/useProjectPlan.ts'

export default function ProjectDetail() {
  const navigate = useNavigate()
  const projects = useProject()
  const project = projects.current
  const id = project?.id ?? ''
  const { phases, tasks, people, patchTask } = useProjectPlan(id)
  const [openIds, setOpenIds] = useState<Set<string> | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [openFor, setOpenFor] = useState(id)

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
  const openTaskRows = tasks.rows.filter((x) => x.status !== 'done' && !x.is_milestone)
  const hoursOpen = openTaskRows.reduce((s, x) => s + (x.estimated_hours ?? 0), 0)
  const start = minDate(phases.rows.map((p) => p.start_date))
  const end = maxDate(phases.rows.map((p) => p.end_date))
  const nextMilestone = tasks.rows.filter((x) => x.is_milestone && x.due_date && x.due_date >= t).sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0]
  const editing = tasks.rows.find((x) => x.id === editingId) ?? null

  async function addPhase() {
    const last = sortedPhases[sortedPhases.length - 1]
    const s = last ? addDays(last.end_date, 1) : nextMonday()
    const p = await phases.add({ project_id: id, name: 'New phase', sort_order: (last?.sort_order ?? -1) + 1, start_date: s, end_date: addDays(s, 27), client_visible: true })
    setOpenIds(new Set([...open, p.id]))
  }

  async function addTask(phase: Phase | null, milestone = false) {
    const s = phase && phase.start_date > t ? phase.start_date : nextMonday()
    const created = await tasks.add({
      project_id: id, phase_id: phase?.id ?? null, title: milestone ? 'New milestone' : 'New task',
      assignee_id: null, start_date: milestone ? null : s, due_date: milestone ? phase?.end_date ?? s : addDays(s, 13),
      estimated_hours: null, status: 'todo', is_milestone: milestone, client_visible: milestone, sort_order: tasks.rows.length,
    })
    setEditingId(created.id)
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

  const span = start && end ? Math.max(1, daysBetween(start, end) + 1) : 1

  const taskRow = (x: Task) => {
    const who = people.rows.find((p) => p.id === x.assignee_id)
    const late = x.due_date && x.due_date < t && x.status !== 'done'
    return (
      <li key={x.id} className={`trow${x.status === 'done' ? ' done' : ''}`} onClick={() => setEditingId(x.id)}>
        <button className={`tick ${x.status}`} title={x.status === 'done' ? 'Mark not done' : 'Mark done'}
          onClick={(e) => { e.stopPropagation(); patchTask(x, { status: x.status === 'done' ? 'todo' : 'done' }) }}>
          {x.status === 'done' ? '✓' : ''}
        </button>
        {x.is_milestone && <span className="diamond" title="Milestone" />}
        <div className="trow-title" onClick={(e) => e.stopPropagation()}>
          <TextField value={x.title} onSave={(v) => v && patchTask(x, { title: v }, false)} />
        </div>
        <span className="trow-meta">
          {x.status === 'in_progress' && <span className="st in_progress">In progress</span>}
          {x.status === 'review' && <span className="st review">In review</span>}
          {x.estimated_hours ? <span className="muted">{x.estimated_hours} h</span> : null}
          <span className={late ? 'late' : 'muted'}>{x.due_date ? shortDate(x.due_date) : ''}</span>
          <span className={`avatar sm${who ? '' : ' empty'}`} title={who?.name ?? 'Unassigned'}>{who ? who.initials ?? who.name.slice(0, 2) : '+'}</span>
        </span>
      </li>
    )
  }

  return (
    <section className="overview">
      <Link to="/" className="back">← All projects</Link>

      <header className="project-head card">
        <div className="project-title">
          <TextField value={project.number} placeholder="Project no." className="mono number"
            onSave={(v) => projects.patch(id, { number: v })} />
          <TextField value={project.name} className="title"
            onSave={(v) => v && projects.patch(id, { name: v })} />
        </div>
        <div className="meta-grid">
          <label>Owner<TextField value={project.client} placeholder="Owner" onSave={(v) => projects.patch(id, { client: v })} /></label>
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
          <div className="stat"><span>Schedule</span>{formatDate(start)} – {formatDate(end)}</div>
          <div className="stat"><span>Open work</span>{openTaskRows.length} tasks · {Math.round(hoursOpen)} h</div>
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
                style={{ flexGrow: daysBetween(p.start_date, p.end_date) + 1, background: phaseColor(i) }}
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
          const list = tasksFor(p.id)
          const work = list.filter((x) => !x.is_milestone)
          const done = work.filter((x) => x.status === 'done').length
          const openCount = work.length - done
          const hrs = work.filter((x) => x.status !== 'done').reduce((s, x) => s + (x.estimated_hours ?? 0), 0)
          const isOpen = open.has(p.id)
          const isNow = p.id === currentPhase?.id && p.start_date <= t
          return (
            <div key={p.id} id={`phase-${p.id}`} className={`phase-sec${isOpen ? ' open' : ''}${p.end_date < t ? ' past' : ''}`}>
              <button className="phase-row" onClick={() => toggle(p.id)} aria-expanded={isOpen}>
                <svg className="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className="dot" style={{ background: phaseColor(i) }} />
                <span className="phase-title">{p.name}</span>
                {isNow && <span className="chip">Current</span>}
                <span className="phase-sum">
                  <span className="muted">{shortDate(p.start_date)} – {shortDate(p.end_date)}</span>
                  <span className="progress" title={`${done} of ${work.length} tasks done`}>
                    <i style={{ width: work.length ? `${(done / work.length) * 100}%` : 0 }} />
                  </span>
                  <span className="muted sum-text">{work.length ? (openCount ? `${openCount} open${hrs ? ` · ${Math.round(hrs)} h` : ''}` : 'All done') : 'No tasks'}</span>
                </span>
              </button>
              {isOpen && (
                <div className="phase-body">
                  <ul className="tlist">
                    {list.map(taskRow)}
                    {list.length === 0 && <li className="muted small empty-row">No tasks in this phase yet.</li>}
                  </ul>
                  <div className="phase-actions">
                    <button className="btn ghost" onClick={() => addTask(p)}>+ Task</button>
                    <button className="btn ghost" onClick={() => addTask(p, true)}>+ Milestone</button>
                    <span className="phase-settings">
                      <TextField value={p.name} className="phase-name-edit" onSave={(v) => v && phases.patch(p.id, { name: v })} />
                      <DateField required value={p.start_date} onSave={(v) => v && phases.patch(p.id, { start_date: v })} />
                      <span className="muted">to</span>
                      <DateField required value={p.end_date} onSave={(v) => v && phases.patch(p.id, { end_date: v })} />
                      <label className="inline-check" title="Show this phase in the presentation view of the schedule">
                        <input type="checkbox" checked={p.client_visible} onChange={(e) => phases.patch(p.id, { client_visible: e.target.checked })} />
                        In presentation
                      </label>
                      <button className="icon-btn" title="Delete phase" onClick={() => deletePhase(p)}>×</button>
                    </span>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {unphased.length > 0 && (
          <div className="phase-sec open">
            <div className="phase-row static"><span className="phase-title">No phase</span></div>
            <div className="phase-body"><ul className="tlist">{unphased.map(taskRow)}</ul></div>
          </div>
        )}
      </div>

      <div className="footer-actions">
        <button className="btn" onClick={addPhase}>+ Add phase</button>
        <button className="btn danger" onClick={deleteProject}>Delete project</button>
      </div>

      {editing && (
        <TaskEditor task={editing} phases={phases.rows} people={people.rows}
          onPatch={(c) => patchTask(editing, c, false)}
          onDelete={() => void tasks.drop(editing.id)}
          onClose={() => setEditingId(null)} />
      )}
    </section>
  )
}
