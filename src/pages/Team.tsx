import { Check, NumberField, TextField } from '../components/fields.tsx'
import { useRows } from '../lib/data.ts'
import type { Person } from '../lib/types.ts'

export default function Team() {
  const people = useRows<Person>('people')
  const byName = (a: Person, b: Person) => a.name.localeCompare(b.name)
  const staff = people.rows.filter((p) => p.kind === 'staff').sort(byName)
  const consultants = people.rows.filter((p) => p.kind === 'consultant').sort(byName)

  async function remove(p: Person) {
    if (!window.confirm(`Remove ${p.name}? Their tasks become unassigned. To keep history, untick "Active" instead.`)) return
    await people.drop(p.id)
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">Staff and their weekly hours drive the workload view. Consultants can be assigned tasks but aren't counted in staff workload.</p>
        </div>
      </header>
      {people.error && <p className="error">{people.error}</p>}

      <div className="card">
        <div className="card-head">
          <h2>Staff <span className="count">{staff.length}</span></h2>
          <button className="btn" onClick={() => people.add({ name: 'New team member', kind: 'staff', weekly_hours: 40, active: true })}>+ Staff</button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 80 }}>Initials</th>
              <th>Role</th>
              <th style={{ width: 110 }} className="num">Hours / week</th>
              <th style={{ width: 70 }} className="center">Active</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {staff.map((p) => (
              <tr key={p.id} className={p.active ? '' : 'inactive'}>
                <td><TextField value={p.name} onSave={(v) => v && people.patch(p.id, { name: v })} /></td>
                <td><TextField value={p.initials} placeholder="—" onSave={(v) => people.patch(p.id, { initials: v })} /></td>
                <td><TextField value={p.role} placeholder="Role" onSave={(v) => people.patch(p.id, { role: v })} /></td>
                <td><NumberField value={p.weekly_hours} onSave={(v) => people.patch(p.id, { weekly_hours: v ?? 0 })} /></td>
                <td className="center"><Check checked={p.active} label="Active" onChange={(v) => people.patch(p.id, { active: v })} /></td>
                <td><button className="icon-btn" title="Remove" onClick={() => remove(p)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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
                <td className="center"><Check checked={p.active} label="Active" onChange={(v) => people.patch(p.id, { active: v })} /></td>
                <td><button className="icon-btn" title="Remove" onClick={() => remove(p)}>×</button></td>
              </tr>
            ))}
            {consultants.length === 0 && <tr><td colSpan={5} className="empty small">No consultants yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
