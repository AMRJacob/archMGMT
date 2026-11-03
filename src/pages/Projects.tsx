import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { insertMany, useRows } from '../lib/data.ts'
import { useProject } from '../lib/projectContext.ts'
import { defaultPhaseRows } from '../lib/phases.ts'
import { formatDate, maxDate, minDate, nextMonday, today as todayISO } from '../lib/dates.ts'
import { PROJECT_STATUSES, type Person, type Phase, type ProjectStatus, type Task } from '../lib/types.ts'

export default function Projects() {
  const navigate = useNavigate()
  const projects = useProject()
  const phases = useRows<Phase>('phases')
  const tasks = useRows<Task>('tasks')
  const people = useRows<Person>('people')
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('active')
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => {
    const today = todayISO()
    return projects.projects
      .filter((p) => filter === 'all' || p.status === filter)
      .map((p) => {
        const ph = phases.rows.filter((x) => x.project_id === p.id)
        const current = ph.find((x) => x.start_date <= today && today <= x.end_date)
        const ts = tasks.rows.filter((t) => t.project_id === p.id && !t.is_milestone)
        return {
          project: p,
          start: minDate(ph.map((x) => x.start_date)),
          end: maxDate(ph.map((x) => x.end_date)),
          currentPhase: current?.name ?? null,
          pm: people.rows.find((x) => x.id === p.pm_id)?.name ?? null,
          open: ts.filter((t) => t.status !== 'done').length,
          total: ts.length,
        }
      })
  }, [projects.projects, phases.rows, tasks.rows, people.rows, filter])

  async function createProject() {
    setBusy(true)
    try {
      const p = await projects.add({ name: 'New project', status: 'active' })
      await insertMany<Phase>('phases', defaultPhaseRows(p.id, nextMonday()))
      projects.select(p.id)
      navigate('/overview')
    } finally {
      setBusy(false)
    }
  }

  const error = projects.error ?? phases.error ?? tasks.error ?? people.error

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>All projects</h1>
          <p className="muted">Every project, its PM, the phase it's in and its open tasks.</p>
        </div>
        <button className="btn primary" onClick={createProject} disabled={busy}>+ New project</button>
      </header>

      <div className="tabs">
        {[{ value: 'all', label: 'All' }, ...PROJECT_STATUSES].map((s) => (
          <button key={s.value} className={filter === s.value ? 'tab active' : 'tab'}
            onClick={() => setFilter(s.value as ProjectStatus | 'all')}>
            {s.label}
            <span className="count">
              {s.value === 'all' ? projects.projects.length : projects.projects.filter((p) => p.status === s.value).length}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      <div className="card">
        <table className="table clickable">
          <thead>
            <tr>
              <th style={{ width: 110 }}>No.</th>
              <th>Project</th>
              <th>PM</th>
              <th>Current phase</th>
              <th>Schedule</th>
              <th className="num">Open tasks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.project.id} className={r.project.id === projects.current?.id ? 'current' : ''}
                onClick={() => { projects.select(r.project.id); navigate('/overview') }}>
                <td className="mono">{r.project.number ?? '—'}</td>
                <td>
                  <div className="strong">{r.project.name}</div>
                  <div className="muted small">{r.project.client ?? 'No client'}</div>
                </td>
                <td>{r.pm ?? <span className="muted">—</span>}</td>
                <td>{r.currentPhase ? <span className="chip">{r.currentPhase}</span> : <span className="muted">—</span>}</td>
                <td className="small">{formatDate(r.start)} – {formatDate(r.end)}</td>
                <td className="num">{r.open} <span className="muted">/ {r.total}</span></td>
              </tr>
            ))}
            {!projects.loading && rows.length === 0 && (
              <tr><td colSpan={6} className="empty">No projects here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
