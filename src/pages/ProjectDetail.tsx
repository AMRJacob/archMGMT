import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, DateField, NumberField, SelectField, TextField } from '../components/fields.tsx'
import PersonOptions from '../components/PersonOptions.tsx'
import { remove, useRows } from '../lib/data.ts'
import { addDays, formatDate, maxDate, minDate, nextMonday } from '../lib/dates.ts'
import {
  PROJECT_STATUSES, TASK_STATUSES,
  type Person, type Phase, type Project, type ProjectStatus, type Task, type TaskStatus,
} from '../lib/types.ts'

export default function ProjectDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const projects = useRows<Project>('projects', { id })
  const phases = useRows<Phase>('phases', { project_id: id })
  const tasks = useRows<Task>('tasks', { project_id: id })
  const people = useRows<Person>('people')
  const project = projects.rows[0]

  const sortedPhases = useMemo(
    () => [...phases.rows].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date)),
    [phases.rows],
  )
  const tasksFor = (phaseId: string | null) =>
    tasks.rows
      .filter((t) => t.phase_id === phaseId)
      .sort((a, b) => (a.start_date ?? a.due_date ?? '').localeCompare(b.start_date ?? b.due_date ?? '') || a.sort_order - b.sort_order)
  const unphased = tasksFor(null)

  if (projects.loading) return <p className="muted">Loading…</p>
  if (!project) return <p>Project not found. <Link to="/projects">Back to projects</Link></p>

  const staff = people.rows.filter((p) => p.kind === 'staff')
  const hours = tasks.rows.reduce((sum, t) => sum + (t.estimated_hours ?? 0), 0)
  const start = minDate(phases.rows.map((p) => p.start_date))
  const end = maxDate(phases.rows.map((p) => p.end_date))

  async function addPhase() {
    const last = sortedPhases[sortedPhases.length - 1]
    const s = last ? addDays(last.end_date, 1) : nextMonday()
    await phases.add({ project_id: id, name: 'New phase', sort_order: (last?.sort_order ?? -1) + 1, start_date: s, end_date: addDays(s, 27), client_visible: true })
  }

  async function addTask(phase: Phase | null, milestone = false) {
    const s = phase?.start_date ?? nextMonday()
    await tasks.add({
      project_id: id, phase_id: phase?.id ?? null, title: milestone ? 'New milestone' : 'New task',
      assignee_id: null, start_date: milestone ? null : s, due_date: milestone ? phase?.end_date ?? s : addDays(s, 13),
      estimated_hours: null, status: 'todo', is_milestone: milestone, client_visible: milestone, sort_order: tasks.rows.length,
    })
  }

  async function deleteProject() {
    if (!window.confirm(`Delete "${project.name}" with all its phases and tasks? This can't be undone.`)) return
    await remove('projects', id)
    navigate('/projects')
  }

  async function deletePhase(p: Phase) {
    const n = tasksFor(p.id).length
    if (!window.confirm(`Delete the ${p.name} phase?${n ? ` Its ${n} task(s) will move to "No phase".` : ''}`)) return
    await phases.drop(p.id)
    void tasks.reload()
  }

  const taskTable = (rows: Task[]) => (
    <table className="table tasks">
      <thead>
        <tr>
          <th>Task</th>
          <th style={{ width: 200 }}>Assigned to</th>
          <th style={{ width: 152 }}>Start</th>
          <th style={{ width: 152 }}>Due</th>
          <th style={{ width: 70 }} className="num">Hours</th>
          <th style={{ width: 140 }}>Status</th>
          <th style={{ width: 54 }} className="center" title="Show on client schedule">Client</th>
          <th style={{ width: 36 }} />
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id} className={t.status === 'done' ? 'done' : ''}>
            <td>
              <div className="task-title">
                {t.is_milestone && <span className="diamond" title="Milestone" />}
                <TextField value={t.title} onSave={(v) => v && tasks.patch(t.id, { title: v })} />
              </div>
            </td>
            <td>
              <SelectField value={t.assignee_id} onSave={(v) => tasks.patch(t.id, { assignee_id: v })}>
                <PersonOptions people={people.rows} />
              </SelectField>
            </td>
            <td>{t.is_milestone ? <span className="muted small">—</span> : <DateField value={t.start_date} onSave={(v) => tasks.patch(t.id, { start_date: v })} />}</td>
            <td><DateField value={t.due_date} onSave={(v) => tasks.patch(t.id, { due_date: v })} /></td>
            <td>{t.is_milestone ? null : <NumberField value={t.estimated_hours} onSave={(v) => tasks.patch(t.id, { estimated_hours: v })} placeholder="—" />}</td>
            <td>
              <SelectField<TaskStatus> value={t.status} onSave={(v) => v && tasks.patch(t.id, { status: v })} className={`status ${t.status}`}>
                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectField>
            </td>
            <td className="center"><Check checked={t.client_visible} label="Show on client schedule" onChange={(v) => tasks.patch(t.id, { client_visible: v })} /></td>
            <td><button className="icon-btn" title="Delete task" onClick={() => tasks.drop(t.id)}>×</button></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={8} className="empty small">No tasks yet.</td></tr>}
      </tbody>
    </table>
  )

  return (
    <section>
      <Link to="/projects" className="back">← Projects</Link>

      <header className="project-head card">
        <div className="project-title">
          <TextField value={project.number} placeholder="Project no." className="mono number"
            onSave={(v) => projects.patch(id, { number: v })} />
          <TextField value={project.name} className="title"
            onSave={(v) => v && projects.patch(id, { name: v })} />
        </div>
        <div className="meta-grid">
          <label>Client<TextField value={project.client} placeholder="Client" onSave={(v) => projects.patch(id, { client: v })} /></label>
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
          <div className="stat"><span>Estimated hours</span>{hours.toLocaleString()}</div>
        </div>
        <label className="notes">Notes<TextField multiline value={project.notes} placeholder="Scope, contract notes…" onSave={(v) => projects.patch(id, { notes: v })} /></label>
      </header>

      {[projects.error, phases.error, tasks.error].filter(Boolean).map((e) => <p key={e} className="error">{e}</p>)}

      {sortedPhases.map((p) => (
        <div key={p.id} className="card phase">
          <div className="phase-head">
            <TextField value={p.name} className="phase-name" onSave={(v) => v && phases.patch(p.id, { name: v })} />
            <div className="phase-dates">
              <DateField required value={p.start_date} onSave={(v) => v && phases.patch(p.id, { start_date: v })} />
              <span className="muted">to</span>
              <DateField required value={p.end_date} onSave={(v) => v && phases.patch(p.id, { end_date: v })} />
            </div>
            <label className="inline-check">
              <input type="checkbox" checked={p.client_visible} onChange={(e) => phases.patch(p.id, { client_visible: e.target.checked })} />
              On client schedule
            </label>
            <button className="icon-btn" title="Delete phase" onClick={() => deletePhase(p)}>×</button>
          </div>
          {taskTable(tasksFor(p.id))}
          <div className="row-actions">
            <button className="btn ghost" onClick={() => addTask(p)}>+ Task</button>
            <button className="btn ghost" onClick={() => addTask(p, true)}>+ Milestone</button>
          </div>
        </div>
      ))}

      {unphased.length > 0 && (
        <div className="card phase">
          <div className="phase-head"><span className="phase-name">No phase</span></div>
          {taskTable(unphased)}
        </div>
      )}

      <div className="footer-actions">
        <button className="btn" onClick={addPhase}>+ Add phase</button>
        <button className="btn danger" onClick={deleteProject}>Delete project</button>
      </div>
      <p className="muted small">Changes save as you go.</p>
    </section>
  )
}
