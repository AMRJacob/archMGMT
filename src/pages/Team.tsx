import { Fragment, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, DateField, SelectField, TextField } from '../components/fields.tsx'
import { projectAccent } from '../lib/colors.ts'
import { useRows } from '../lib/data.ts'
import { addDays, formatDate, parseISO, shortDate, today } from '../lib/dates.ts'
import { useProject } from '../lib/projectContext.ts'
import { buildTree, isWorkLeaf } from '../lib/tree.ts'
import { EFFORTS, type Person, type Project, type Task, type TimeOff } from '../lib/types.ts'
import { assigneesOf, isAssigned } from '../lib/assignees.ts'
import {
  capacityForWeek, countsTowardWorkload, daysOff, LOAD_LEVELS, loadLevel, mondayOf, taskLoadByWeek, weekStarts,
} from '../lib/workload.ts'

const WEEKS = 12
const AVAILABILITY = [100, 90, 80, 75, 60, 50, 40, 25, 20, 10]

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
  const projectMap = useMemo(() => new Map<string, Project>(projects.map((p) => [p.id, p])), [projects])

  // Load per person per week, per-project breakdown, and which tasks make it up.
  const load = useMemo(() => {
    const total = new Map<string, Map<string, number>>()
    const perProject = new Map<string, Map<string, Map<string, number>>>()
    const active = new Map<string, Map<string, Task[]>>()
    const due = new Map<string, Map<string, Task[]>>()
    const push = <V,>(m: Map<string, Map<string, V[]>>, who: string, w: string, v: V) => {
      const mw = m.get(who) ?? new Map<string, V[]>()
      mw.set(w, [...(mw.get(w) ?? []), v])
      m.set(who, mw)
    }
    const tree = buildTree(tasks.rows)
    for (const t of tasks.rows) {
      // Only the bottom scheduled level carries load (a sheet with tasks under it isn't counted twice).
      if (!countsTowardWorkload(t, projectMap) || !isWorkLeaf(tree, t)) continue
      // Everyone on a task carries it in full: shared work still fills each person's week.
      const ids = assigneesOf(t)
      for (const who of ids.length ? ids : ['unassigned']) {
      if (t.due_date) push(due, who, mondayOf(t.due_date), t)
      for (const [w, l] of taskLoadByWeek(t)) {
        const tw = total.get(who) ?? new Map<string, number>()
        tw.set(w, (tw.get(w) ?? 0) + l)
        total.set(who, tw)
        const pp = perProject.get(who) ?? new Map<string, Map<string, number>>()
        const pw = pp.get(t.project_id) ?? new Map<string, number>()
        pw.set(w, (pw.get(w) ?? 0) + l)
        pp.set(t.project_id, pw)
        perProject.set(who, pp)
        push(active, who, w, t)
      }
      }
    }
    return { total, perProject, active, due }
  }, [tasks.rows, projectMap])

  const loadOf = (id: string, w: string) => load.total.get(id)?.get(w) ?? 0
  const activeStaff = staff.filter((p) => p.active)
  const firmLoad = (w: string) => activeStaff.reduce((s, p) => s + loadOf(p.id, w), 0)
  const firmCap = (w: string) => activeStaff.reduce((s, p) => s + capacityForWeek(p, w, timeOff.rows), 0)
  const unassignedCount = (w: string) => load.active.get('unassigned')?.get(w)?.length ?? 0

  const levelLabel = (l: string) => LOAD_LEVELS.find((x) => x.value === l)?.label ?? 'Nothing scheduled'
  const effortLabel = (t: Task) => EFFORTS.find((e) => e.value === (t.effort ?? 2))?.label ?? 'Medium'

  /** Hover text for a cell: the level, then what's running and what's due. */
  const cellTitle = (p: Person, w: string, cap: number) => {
    const lv = loadLevel(loadOf(p.id, w), cap)
    const run = load.active.get(p.id)?.get(w) ?? []
    const dueHere = load.due.get(p.id)?.get(w) ?? []
    const off = daysOff(p, w, timeOff.rows)
    const name = (t: Task) => `${t.title} (${projectMap.get(t.project_id)?.name ?? ''})`
    return [
      `Week of ${shortDate(w)}: ${levelLabel(lv)}`,
      off ? `${off} day${off === 1 ? '' : 's'} off` : '',
      run.length ? `\nWorking on:\n${run.map((t) => `• ${name(t)}, ${effortLabel(t).toLowerCase()}`).join('\n')}` : '',
      dueHere.length ? `\nDue:\n${dueHere.map((t) => `◆ ${name(t)}, ${shortDate(t.due_date)}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')
  }

  const openTasks = (id: string) =>
    tasks.rows
      .filter((t) => isAssigned(t, id) && t.status !== 'done' && t.kind !== 'item')
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

  const dueMark = (n: number) => n > 0 ? <span className="due-mark" aria-label={`${n} due`}>◆{n > 1 ? n : ''}</span> : null
  const cols = WEEKS + 1

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Team &amp; workload</h1>
          <p className="muted">
            How full each person's weeks are, from the size of the open tasks they're on, their availability and time off.
            Hover a week to see what's in it. ◆ marks due dates. Click a person for their projects and details.
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
            {LOAD_LEVELS.map((l) => <Fragment key={l.value}><span className={`lv ${l.value}`} />{l.label}</Fragment>)}
            <button className="btn" onClick={async () => { const p = await people.add({ name: 'New team member', kind: 'staff', weekly_hours: 40, availability: 100, active: true }); setOpenId(p.id) }}>+ Staff</button>
          </div>
        </div>
        <div className="scroll-x">
          <table className="table workload heat">
            <thead>
              <tr>
                <th className="who">Person</th>
                {weeks.map(weekHead)}
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => {
                const open = openId === p.id
                const caps = weeks.map((w) => capacityForWeek(p, w, timeOff.rows))
                const breakdown = [...(load.perProject.get(p.id) ?? new Map<string, Map<string, number>>()).entries()]
                  .filter(([, m]) => weeks.some((w) => (m.get(w) ?? 0) > 0.05))
                const mine = timeOff.rows.filter((o) => o.person_id === p.id).sort((a, b) => a.start_date.localeCompare(b.start_date))
                const avail = p.availability ?? 100
                return (
                  <Fragment key={p.id}>
                    <tr className={`person${open ? ' open' : ''}${p.active ? '' : ' inactive'}`} onClick={() => setOpenId(open ? null : p.id)}>
                      <td className="who">
                        <div className="who-in">
                          <span className="avatar">{p.initials ?? p.name.slice(0, 2)}</span>
                          <span>
                            <span className="strong">{p.name}</span>
                            <span className="muted small block">{p.role ?? 'No role'}{avail < 100 ? ` · ${avail}% available` : ''}</span>
                          </span>
                        </div>
                      </td>
                      {weeks.map((w, i) => (
                        <td key={w} className={`cell ${loadLevel(loadOf(p.id, w), caps[i])}${w === thisWeek ? ' now' : ''}`} title={cellTitle(p, w, caps[i])}>
                          {dueMark(load.due.get(p.id)?.get(w)?.length ?? 0)}
                          {daysOff(p, w, timeOff.rows) > 0 && <span className="off" />}
                        </td>
                      ))}
                    </tr>
                    {open && breakdown.map(([projectId, m]) => {
                      const proj = projectMap.get(projectId)
                      const color = projectAccent(proj?.color).accent
                      return (
                        <tr key={projectId} className="sub" onClick={() => { select(projectId); navigate('/overview') }}>
                          <td className="who"><div className="sub-who"><span className="pdot" style={{ background: color }} />{proj?.name ?? 'Project'}</div></td>
                          {weeks.map((w, i) => {
                            const share = caps[i] > 0 ? Math.min(1, (m.get(w) ?? 0) / caps[i]) : 0
                            return (
                              <td key={w} className={`subcell${w === thisWeek ? ' now' : ''}`}>
                                {share > 0.02 && <i className="share" style={{ width: `${Math.max(12, share * 100)}%`, background: color }} />}
                              </td>
                            )
                          })}
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
                              <label>Email<TextField value={p.email ?? null} placeholder="name@amr-architects.com" onSave={(v) => people.patch(p.id, { email: v?.toLowerCase() ?? null })} /></label>
                              <label title="Share of a full-time load this person can take on">Availability
                                <SelectField value={String(avail)} onSave={(v) => people.patch(p.id, { availability: Number(v ?? 100) })}>
                                  {[...new Set([...AVAILABILITY, avail])].sort((a, b) => b - a).map((a) => <option key={a} value={String(a)}>{a === 100 ? 'Full time (100%)' : `${a}%`}</option>)}
                                </SelectField>
                              </label>
                              <label className="inline-check"><input type="checkbox" checked={p.active} onChange={(e) => people.patch(p.id, { active: e.target.checked })} />Active</label>
                              <button className="btn danger small-btn" onClick={() => removePerson(p)}>Remove</button>
                            </div>
                            <div className="pd-cols">
                              <div>
                                <h3>Open tasks</h3>
                                <ul className="task-list">
                                  {openTasks(p.id).slice(0, 8).map((t) => (
                                    <li key={t.id}>
                                      {t.is_milestone ? <span className="diamond" /> : <span className={`effort e${t.effort ?? 2}`} title={effortLabel(t)}><i /><i /><i /></span>}
                                      <span className="strong">{t.title}</span>
                                      <span className="muted"> · {projectMap.get(t.project_id)?.name ?? ''}</span>
                                      <span className="muted right">{t.due_date ? `Due ${formatDate(t.due_date)}` : ''}</span>
                                    </li>
                                  ))}
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
                <td className="who">Whole office</td>
                {weeks.map((w) => (
                  <td key={w} className={`cell ${loadLevel(firmLoad(w), firmCap(w))}${w === thisWeek ? ' now' : ''}`}
                    title={`Week of ${shortDate(w)}: office is ${levelLabel(loadLevel(firmLoad(w), firmCap(w))).toLowerCase()}`} />
                ))}
              </tr>
              {weeks.some((w) => unassignedCount(w) > 0) && (
                <tr className="unassigned">
                  <td className="who">Unassigned <span className="muted small block">open tasks with no one on them</span></td>
                  {weeks.map((w) => <td key={w} className="subcell">{unassignedCount(w) || ''}</td>)}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Consultants <span className="count">{consultants.length}</span></h2>
          <button className="btn" onClick={() => people.add({ name: 'New consultant', kind: 'consultant', weekly_hours: 0, availability: 100, active: true })}>+ Consultant</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Contact</th>
              <th>Company</th>
              <th style={{ width: 180 }}>Discipline</th>
              <th style={{ width: 220 }}>Email</th>
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
                <td><TextField value={p.email ?? null} placeholder="Email" onSave={(v) => people.patch(p.id, { email: v?.toLowerCase() ?? null })} /></td>
                <td className="num">{openTasks(p.id).length}</td>
                <td className="center"><Check checked={p.active} label="Active" onChange={(v) => people.patch(p.id, { active: v })} /></td>
                <td><button className="icon-btn" title="Remove" onClick={() => removePerson(p)}>×</button></td>
              </tr>
            ))}
            {consultants.length === 0 && <tr><td colSpan={7} className="empty small">No consultants yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        A full-time person is treated as comfortably carrying about three medium tasks at once. Consultants aren't counted in staff
        workload, and tasks on projects that are complete or on hold aren't counted. Hours and billing stay in Monograph.
      </p>
    </section>
  )
}
