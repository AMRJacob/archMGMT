import type { Person } from '../lib/types.ts'

/** <option>s for an assignee picker: staff first, then consultants grouped by company. */
export default function PersonOptions({ people, includeConsultants = true }: { people: Person[]; includeConsultants?: boolean }) {
  const active = people.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name))
  const staff = active.filter((p) => p.kind === 'staff')
  const consultants = active.filter((p) => p.kind === 'consultant')
  return (
    <>
      <option value="">Unassigned</option>
      <optgroup label="Staff">
        {staff.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </optgroup>
      {includeConsultants && consultants.length > 0 && (
        <optgroup label="Consultants">
          {consultants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.company ? ` (${p.company})` : ''}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}
