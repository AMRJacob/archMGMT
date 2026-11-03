import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, DateField, NumberField, TextField } from '../components/fields.tsx'
import { useRows } from '../lib/data.ts'
import { addDays, formatDate, parseISO, today } from '../lib/dates.ts'
import { useProject } from '../lib/projectContext.ts'
import type { Person, Project, Task, TimeOff } from '../lib/types.ts'
import { capacityForWeek, countsTowardWorkload, loadLevel, mondayOf, taskHoursByWeek, weekStarts } from '../lib/workload.ts'

const WEEKS = 12

const fmt = (h: number) => (h < 0.5 ? '' : Math.round(h).toString())

export default function Team() {
  const navigate = useNavigate()
  const { projects, select } = useProject()
  const people = useRows<Person>('people')
  const tasks = useRows<Task>('tasks')
  const timeOff = useRows<TimeOff>('time_off')
  const [from, setFrom] = useState(() => mondayOf(today()))
  const [openId, setOpenId] = useState<string | null>(null)

  const weeks = useMemo(() => weekStarts(from, WEEKS), [from])
  const thisWeek = mondayOf(today())
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name)
  const staff = people.rows.filter((p) => p.kind === 'staff').sort((a, b) => Number(b.active) - Number(a.active) || byName(a, b))
  const consultants = people.rows.filter((p) => p.kind === 'consultant').sort(byName)

  // hours[personId][week] and per-project breakdown
  const load = useMemo(() => {
    const projectMap = new Map<string, Project>(projects.map((p) => [p.id, p]))
    const total = new Map<string, Map<string, number>>()
    const perProject = new Map<string, Map<string, Map<string, number>>>()
    for (const t of tasks.rows) {
      if (!countsTowardWorkload(t, projectMap)) continue
      const who = t.assignee_id ?? 'unassigned'
      for (const [w, h] of taskHoursByWeek(t)) {
        const tw = total.get(who) ?? new Map<string, number>()
        tw.set(w, (tw.get(w) ?? 0) + h)
        total.set(who, tw)
        const pp = perProject.get(who) ?? new Map<string, Map<string, number>>()
        const pw = pp.get(t.project_id) ?? new Map<string, number>()
        pw.set(w, (pw.get(w) ?? 0) + h)
        pp.set(t.project_id, pw)
        perProject.set(who, pp)
      }
    }
    return { total, perProject }
  }, [tasks.rows, projects])

  const hoursOf = (id: string, w: string) => load.total.get(id)?.get(w) ?? 0
  const activeStaff = staff.filter((p) => p.active)
  const firmHours = (w: string) => activeStaff.reduce((s, p) => s + hoursOf(p.id, w), 0)
  const firmCap = (w: string) => activeStaff.reduce((s, p) => s + capacityForWeek(p, w, timeOff.rows), 0)
  const unassigned = weeks.map((w) => hoursOf('unassigned', w))

  const openTasks = (id: string) =>
    tasks.rows
      .filter((t) => t.assignee_id === id && t.status !== 'done')
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))

  async function removePerson(p: Person) {
    if (!window.confirm(`Remove ${p.name}? Their tasks become unassigned. To keep history, untick "Active" instead.`)) return
    await people.drop(p.id)
    void tasks.reload()
  }

  const weekHead = (w: string) => {
    const d = parseISO(w)
    return (
      <th key={w} className={`wk${w === thisWeek ? ' now' : ''}`}>
        <span>{d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</span>
        {d.getUTCDate()}
      </th>
    )
  }

  const cols = WEEKS + 2

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Team &amp; workload</h1>
          <p className="muted">
            Hours from open tasks, spread over each task's dates, against each person's weekly hours (less time off).
            Click a person to see their projects and edit their details.
          </p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => setFrom(addDays(from, -28))}>‹ Earlier</button>
          <button className="btn" onClick={() => setFrom(mondayOf(today()))} disabled={from === thisWeek}>This week</button>
          <button className="btn" onClick={() => setFrom(addDays(from, 28))}>Later ›</button>
        </div>
      </header>
      {[people.error, tasks.error, timeOff.error].filter(Boolean).map((e) => <p key={e} className="error">{e}</p>)}

      <div className="card">
        <div className="card-head">
          <h2>Staff <span className="count">{activeStaff.length}</span></h2>
          <div className="legend">
            <span className="lv light" />Under 60%
            <span className="lv good" />60–90%
            <span className="lv full" />Full
            <span className="lv over" />Over
            <button className="btn" onClick={async () => { const p = await people.add({ name: 'New team member', kind: 'staff', weekly_hours: 40, active: true }); setOpenId(p.id) }}>+ Staff</button>
          </div>
        </div>
        <div className="scroll-x">
          <table className="table workload">
            <thead>
              <tr>
                <th className="who">Person</th>
                {weeks.map(weekHead)}
                <th className="num avg">Avg</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => {
                const open = openId === p.id
                const caps = weeks.map((w) => capacityForWeek(p, w, timeOff.rows))
                const hrs = weeks.map((w) => hoursOf(p.id, w))
                const capSum = caps.reduce((a, b) => a + b, 0)
                const avg = capSum > 0 ? Math.round((hrs.reduce((a, b) => a + b, 0) / capSum) * 100) : null
                const breakdown = [...(load.perProject.get(p.id) ?? new Map<string, Map<string, number>>()).entries()]
                  .filter(([, m]) => weeks.some((w) => (m.get(w) ?? 0) >= 0.5))
                const mine = timeOff.rows.filter((o) => o.person_id === p.id).sort((a, b) => a.start_date.localeCompare(b.start_date))
                return (
                  <Fragment key={p.id}>
                    <tr className={`person${open ? ' open' : ''}${p.active ? '' : ' inactive'}`} onClick={() => setOpenId(open ? null : p.id)}>
                      <td className="who">
                        <div className="who-in">
                          <span className="avatar">{p.initials ?? p.name.slice(0, 2)}</span>
                          <span>
                            <span className="strong">{p.name}</span>
                            <span className="muted small block">{p.role ?? 'No role'} · {p.weekly_hours} h/wk</span>
                          </span>
                        </div>
                      </td>
                      {weeks.map((w, i) => (
                        <td key={w} className={`cell ${loadLevel(hrs[i], caps[i])}${w === thisWeek ? ' now' : ''}`}
                          title={`${Math.round(hrs[i])} h of ${Math.round(caps[i])} h available`}>
                          {fmt(hrs[i])}
                          {caps[i] < p.weekly_hours && <span className="off" title="Time off this week" />}
                        </td>
                      ))}
                      <td className="num avg">{avg === null ? '—' : `${avg}%`}</td>
                    </tr>
                    {open && breakdown.map(([projectId, m]) => {
                      const proj = projects.find((x) => x.id === projectId)
                      return (
                        <tr key={projectId} className="sub" onClick={() => { select(projectId); navigate('/overview') }}>
                          <td className="who"><div className="sub-who">{proj?.number ? <span className="mono muted">{proj.number} </span> : null}{proj?.name ?? 'Project'}</div></td>
                          {weeks.map((w) => <td key={w} className={`subcell${w === thisWeek ? ' now' : ''}`}>{fmt(m.get(w) ?? 0)}</td>)}
                          <td />
                        </tr>
                      )
                    })}
                    {open && (
                      <tr className="detail">
                        <td colSpan={cols}>
                          <div className="person-detail">
                            <div className="pd-fields">
                              <label>Name<TextField value={p.name} onSave={(v) => v && people.patch(p.id, { name: v })} /></label>
                              <label>Initials<TextField value={p.initials} placeholder="—" onSave={(v) => people.patch(p.id, { initials: v })} /></label>
                              <label>Role<TextField value={p.role} placeholder="Role" onSave={(v) => people.patch(p.id, { role: v })} /></label>
                              <label>Hours / week<NumberField value={p.weekly_hours} onSave={(v) => people.patch(p.id, { weekly_hours: v ?? 0 })} /></label>
                              <label className="inline-check"><input type="checkbox" checked={p.active} onChange={(e) => people.patch(p.id, { active: e.target.checked })} />Active</label>
                              <button className="btn danger small-btn" onClick={() => removePerson(p)}>Remove</button>
                            </div>
                            <div className="pd-cols">
                              <div>
                                <h3>Open tasks</h3>
                                <ul className="task-list">
                                  {openTasks(p.id).slice(0, 8).map((t) => {
                                    const proj = projects.find((x) => x.id === t.project_id)
                                    return (
                                      <li key={t.id}>
                                        {t.is_milestone && <span className="diamond" />}
                                        <span className="strong">{t.title}</span>
                                        <span className="muted"> · {proj?.name ?? ''}</span>
                                        <span className="muted right">{t.due_date ? `Due ${formatDate(t.due_date)}` : ''}{t.estimated_hours ? ` · ${t.estimated_hours} h` : ''}</span>
                                      </li>
                                    )
                                  })}
                                  {openTasks(p.id).length === 0 && <li className="muted">No open tasks.</li>}
                                  {openTasks(p.id).length > 8 && <li className="muted">and {openTasks(p.id).length - 8} more</li>}
                                </ul>
                              </div>
                              <div>
                                <h3>Time off</h3>
                                <ul className="task-list">
                                  {mine.map((o) => (
                                    <li key={o.id} className="off-row">
                                      <DateField required value={o.start_date} onSave={(v) => v && timeOff.patch(o.id, { start_date: v })} />
                                      <span className="muted">to</span>
                                      <DateField required value={o.end_date} onSave={(v) => v && timeOff.patch(o.id, { end_date: v })} />
                                      <TextField value={o.note} placeholder="Note" onSave={(v) => timeOff.patch(o.id, { note: v })} />
                                      <button className="icon-btn" title="Delete" onClick={() => timeOff.drop(o.id)}>×</button>
                                    </li>
                                  ))}
                                  {mine.length === 0 && <li className="muted">None scheduled.</li>}
                                </ul>
                                <button className="btn ghost" onClick={() => {
                                  const s = addDays(mondayOf(today()), 7)
                                  void timeOff.add({ person_id: p.id, start_date: s, end_date: addDays(s, 4), note: null })
                                }}>+ Time off</button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="total">
                <td className="who">Office total <span className="muted small block">hours / available</span></td>
                {weeks.map((w) => (
                  <td key={w} className={`cell ${loadLevel(firmHours(w), firmCap(w))}${w === thisWeek ? ' now' : ''}`}>
                    {Math.round(firmHours(w))}<span className="cap">/{Math.round(firmCap(w))}</span>
                  </td>
                ))}
                <td />
              </tr>
              {unassigned.some((h) => h >= 0.5) && (
                <tr className="unassigned">
                  <td className="who">Unassigned <span className="muted small block">hours with no one on them</span></td>
                  {weeks.map((w, i) => <td key={w} className="subcell">{fmt(unassigned[i])}</td>)}
                  <td />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Consultants <span className="count">{consultants.length}</span></h2>
          <button className="btn" onClick={() => people.add({ name: 'New consultant', kind: 'consultant', weekly_hours: 0, active: true })}>+ Consultant</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Company</th>
              <th style={{ width: 180 }}>Discipline</th>
              <th style={{ width: 100 }} className="num">Open tasks</th>
              <th style={{ width: 70 }} className="center">Active</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {consultants.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'inactive'}>
                <td><TextField value={p.name} onSave={(v) => v && people.patch(p.id, { name: v })} /></td>
                <td><TextField value={p.company} placeholder="Company" onSave={(v) => people.patch(p.id, { company: v })} /></td>
                <td><TextField value={p.discipline} placeholder="Structural, MEP, Civil…" onSave={(v) => people.patch(p.id, { discipline: v })} /></td>
                <td className="num">{openTasks(p.id).length}</td>
                <td className="center"><Check checked={p.active} label="Active" onChange={(v) => people.patch(p.id, { active: v })} /></td>
                <td><button className="icon-btn" title="Remove" onClick={() => removePerson(p)}>×</button></td>
              </tr>
            ))}
            {consultants.length === 0 && <tr><td colSpan={6} className="empty small">No consultants yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">Consultants can be assigned tasks but aren't counted in staff workload. Tasks on projects that are complete or on hold aren't counted.</p>
    </section>
  )
}
