import { useState } from 'react'
import Modal from './Modal.tsx'
import { AmountField, SelectField, TextField } from './fields.tsx'
import PersonOptions from './PersonOptions.tsx'
import ProjectTeam from './ProjectTeam.tsx'
import { area, BUILDING_TYPES, money } from '../lib/amount.ts'
import { PROJECT_STATUSES, type Person, type Project, type ProjectStatus } from '../lib/types.ts'

/** Building type: the standard list, or "Other…" to type one. */
export function BuildingTypeField({ value, onSave }: { value: string | null; onSave: (v: string | null) => void }) {
  const known = !value || BUILDING_TYPES.includes(value)
  const [other, setOther] = useState(!known)
  if (other) {
    return <TextField value={value} placeholder="Building type" autoFocus={known} onSave={(v) => { onSave(v); if (!v) setOther(false) }} onEscape={() => setOther(false)} />
  }
  return (
    <select className="field" value={value ?? ''} onChange={(e) => {
      if (e.target.value === '__other') { setOther(true); return }
      onSave(e.target.value || null)
    }}>
      <option value="">Not set</option>
      {BUILDING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      <option value="__other">Other…</option>
    </select>
  )
}

/** A project's details (the same ones as the top of its Overview), edited from the All Projects list. Saves as you go. */
export default function ProjectDetailsDialog({ project, people, onPatch, onClose }: {
  project: Project
  people: Person[]
  onPatch: (c: Partial<Project>) => void
  onClose: () => void
}) {
  const staff = people.filter((p) => p.kind === 'staff')
  return (
    <Modal title={`Project details · ${[project.number, project.name].filter(Boolean).join(' ')}`} onClose={onClose}
      footer={<><span className="muted small grow">Changes save as you go.</span><button className="btn primary" onClick={onClose}>Done</button></>}>
      <div className="modal-grid">
        <label>Project no.<TextField value={project.number} placeholder="Project no." className="mono" onSave={(v) => onPatch({ number: v })} /></label>
        <label>Name<TextField value={project.name} onSave={(v) => v && onPatch({ name: v })} /></label>
        <label>Owner<TextField value={project.client} placeholder="Owner" onSave={(v) => onPatch({ client: v })} /></label>
        <label>Building type<BuildingTypeField value={project.building_type ?? null} onSave={(v) => onPatch({ building_type: v })} /></label>
        <label>Project manager
          <SelectField value={project.pm_id} onSave={(v) => onPatch({ pm_id: v })}>
            <PersonOptions people={staff} includeConsultants={false} />
          </SelectField>
        </label>
        <label>Status
          <SelectField<ProjectStatus> value={project.status} onSave={(v) => v && onPatch({ status: v })}>
            {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </SelectField>
        </label>
        <label>Budget
          <AmountField value={project.budget ?? null} placeholder="e.g. 4.25m" format={money} onSave={(v) => onPatch({ budget: v })} />
        </label>
        <label>Gross area
          <AmountField value={project.gross_area ?? null} placeholder="e.g. 12,500" format={area} onSave={(v) => onPatch({ gross_area: v })} />
        </label>
      </div>
      <div className="team-row pd-team"><span className="team-label">Team</span>
        <ProjectTeam project={project} people={people} onChange={(team) => onPatch({ team })} />
      </div>
      <label className="pd-notes">Notes<TextField multiline value={project.notes} placeholder="Scope, contract notes…" onSave={(v) => onPatch({ notes: v })} /></label>
    </Modal>
  )
}
