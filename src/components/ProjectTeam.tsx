import { initialsOf } from '../lib/assignees.ts'
import type { Person, Project } from '../lib/types.ts'
import { Pop } from './TaskChips.tsx'

/**
 * A project's team: who's working on it. Shown on the Overview and above the person board. When a team is
 * set, assigning a task offers the team (anyone else is one click away).
 */
export default function ProjectTeam({ project, people, onChange, compact = false }: {
  project: Project
  people: Person[]
  onChange: (team: string[]) => void
  compact?: boolean
}) {
  const team = project.team ?? []
  const members = team.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => Boolean(p))
  const others = people.filter((p) => p.active && !team.includes(p.id)).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  return (
    <div className={`project-team${compact ? ' compact' : ''}`}>
      {members.map((p) => (
        <span key={p.id} className="team-chip" title={p.kind === 'consultant' && p.company ? `${p.name} · ${p.company}` : p.name}>
          <span className="avatar sm">{initialsOf(p)}</span>{p.name}
          <button className="icon-btn" title={`Take ${p.name} off the team`} onClick={() => onChange(team.filter((x) => x !== p.id))}>×</button>
        </span>
      ))}
      <Pop title="Add someone to this project's team" label={<span className="btn ghost small-btn">+ Add team member</span>}>
        {(close) => (
          <div className="pm-people">
            {(['staff', 'consultant'] as const).map((k) => others.some((p) => p.kind === k) && (
              <div key={k}>
                <div className="pm-label">{k === 'staff' ? 'Staff' : 'Consultants'}</div>
                {others.filter((p) => p.kind === k).map((p) => (
                  <button key={p.id} className="pm-item pick" onClick={() => { onChange([...team, p.id]); close() }}>
                    <span className="avatar sm">{initialsOf(p)}</span>
                    <span>{p.name}{p.company ? <span className="pm-hint">{p.company}</span> : null}</span>
                  </button>
                ))}
              </div>
            ))}
            {others.length === 0 && <p className="muted small" style={{ padding: '4px 8px' }}>Everyone on the Team list is already on this project.</p>}
          </div>
        )}
      </Pop>
      {members.length === 0 && !compact && <span className="muted small">No team yet: assigning offers everyone.</span>}
    </div>
  )
}
