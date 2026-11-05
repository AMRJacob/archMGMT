import { Pop } from './TaskChips.tsx'
import { MILESTONE_TYPES, type MilestoneType } from '../lib/milestones.ts'
import type { PresentationRules } from '../lib/presentation.ts'

/** The presentation view's "what's shown" rules, as a row of toggles. Saved on the project for everyone. */
export default function PresentationFilter({ rules, onChange, picked, hiddenPhases }: {
  rules: PresentationRules
  onChange: (r: PresentationRules) => void
  /** Items added by hand that the rules wouldn't show. */
  picked: number
  hiddenPhases: number
}) {
  const ms = rules.milestones
  const msLabel = ms === 'all' ? 'All milestones' : ms === 'none' || ms.length === 0 ? 'No milestones' : `${ms.length} milestone type${ms.length === 1 ? '' : 's'}`
  const typeOn = (t: MilestoneType) => ms === 'all' || (Array.isArray(ms) && ms.includes(t))
  const toggleType = (t: MilestoneType) => {
    const cur = ms === 'all' ? MILESTONE_TYPES.map((m) => m.value) : ms === 'none' ? [] : ms
    const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
    onChange({ ...rules, milestones: next.length === MILESTONE_TYPES.length ? 'all' : next.length ? next : 'none' })
  }
  const toggle = (on: boolean, key: 'sheets' | 'tasks') => (
    <button type="button" className={`filter-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange({ ...rules, [key]: !on })}>
      {on ? '✓ ' : ''}{key === 'sheets' ? 'Sheets' : 'General tasks'}
    </button>
  )
  const extras = [
    picked ? `${picked} added by hand` : '',
    rules.hidden.length ? `${rules.hidden.length} hidden by hand` : '',
    hiddenPhases ? `${hiddenPhases} phase${hiddenPhases === 1 ? '' : 's'} hidden` : '',
  ].filter(Boolean)
  return (
    <div className="pres-filter grow">
      <span className="muted small">Show</span>
      <Pop className="filter-pop" title="Which milestones to show" label={<span className={`filter-chip${ms === 'none' ? '' : ' on'}`}>{ms === 'none' ? '' : '✓ '}{msLabel} ▾</span>}>
        {() => (
          <>
            <div className="pm-label">Milestones to show</div>
            {MILESTONE_TYPES.map((m) => (
              <label key={m.value} className="pm-item check">
                <input type="checkbox" checked={typeOn(m.value)} onChange={() => toggleType(m.value)} />
                <span className="diamond" style={{ background: m.color }} />{m.label}
              </label>
            ))}
            <div className="pm-sep" />
            <button className="pm-item" onClick={() => onChange({ ...rules, milestones: 'all' })}>All milestones</button>
            <button className="pm-item" onClick={() => onChange({ ...rules, milestones: 'none' })}>None</button>
          </>
        )}
      </Pop>
      {toggle(rules.sheets, 'sheets')}
      {toggle(rules.tasks, 'tasks')}
      <span className="muted small">
        {extras.length ? `${extras.join(' · ')}. ` : ''}Right-click anything in the working view to add or hide it.
        {rules.hidden.length > 0 && <> <button className="linkbtn" onClick={() => onChange({ ...rules, hidden: [] })}>Unhide all</button></>}
      </span>
    </div>
  )
}
