import { useState, type CSSProperties } from 'react'
import { addDays, shortDate, today } from '../lib/dates.ts'
import { mondayOf } from '../lib/workload.ts'
import { assigneesOf } from '../lib/assignees.ts'
import { headOf, type Tree } from '../lib/tree.ts'
import type { Person, Phase, Task } from '../lib/types.ts'
import { AvatarStack } from './TaskChips.tsx'

/**
 * The schedule as a list by date: what's late, this week, next week, then by month. Made for phones, where a
 * timeline is too narrow to read. Tick to finish; tap to open.
 */
export default function AgendaList({ tasks, tree, phases, people, palette, onToggle, onOpen }: {
  tasks: Task[]
  tree: Tree
  phases: Phase[]
  people: Person[]
  /** Phase colours, in phase order. */
  palette: string[]
  onToggle: (t: Task) => void
  onOpen: (t: Task) => void
}) {
  const [showDone, setShowDone] = useState(false)
  const t0 = today()
  const wk = mondayOf(t0)
  const nextWk = addDays(wk, 7)
  const after = addDays(wk, 14)
  const order = [...phases].sort((a, b) => a.sort_order - b.sort_order)
  const colorOf = new Map(order.map((p, i) => [p.id, palette[i] ?? '#999']))
  const nameOf = new Map(order.map((p) => [p.id, p.name]))
  const due = (t: Task) => t.due_date ?? t.start_date
  const rows = tasks.filter((t) => showDone || t.status !== 'done')
  const groups = new Map<string, Task[]>()
  const put = (k: string, t: Task) => groups.set(k, [...(groups.get(k) ?? []), t])
  for (const t of rows) {
    const d = due(t)
    if (!d) put('~none', t)
    else if (t.status !== 'done' && d < t0) put('0late', t)
    else if (d < wk) put('1past', t)
    else if (d < nextWk) put('2this', t)
    else if (d < after) put('3next', t)
    else put(`4${d.slice(0, 7)}`, t)
  }
  const label = (k: string) => {
    if (k === '0late') return 'Overdue'
    if (k === '1past') return 'Earlier'
    if (k === '2this') return `This week · ${shortDate(wk)}`
    if (k === '3next') return `Next week · ${shortDate(nextWk)}`
    if (k === '~none') return 'No date'
    const [y, m] = k.slice(1).split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  const keys = [...groups.keys()].sort()
  const byDate = (a: Task, b: Task) => (due(a) ?? '').localeCompare(due(b) ?? '') || a.title.localeCompare(b.title)

  return (
    <div className="agenda">
      <div className="agenda-bar">
        <span className="muted small">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
        <label className="inline-check small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show done</label>
      </div>
      {keys.length === 0 && <p className="muted agenda-empty">Nothing {showDone ? '' : 'open '}at this detail level.</p>}
      {keys.map((k) => (
        <section key={k} className={`agenda-group${k === '0late' ? ' late' : ''}`}>
          <h3>{label(k)}<span className="count">{groups.get(k)!.length}</span></h3>
          <ul>
            {groups.get(k)!.sort(byDate).map((t) => {
              const head = headOf(tree, tree.byId.get(t.id) ?? t)
              const who = people.filter((p) => assigneesOf(t).includes(p.id))
              const where = [t.phase_id ? nameOf.get(t.phase_id) : null, head && head.id !== t.id ? [head.sheet_number, head.title].filter(Boolean).join(' ') : null].filter(Boolean).join(' · ')
              return (
                <li key={t.id} className={`agenda-row${t.status === 'done' ? ' done' : ''}`} style={{ '--pc': t.phase_id ? colorOf.get(t.phase_id) : '#bbb' } as CSSProperties}>
                  {t.is_milestone
                    ? <span className="diamond agenda-diamond" />
                    : <button className={`tick ${t.status}`} aria-label={t.status === 'done' ? 'Mark not done' : 'Mark done'} onClick={() => onToggle(t)}>{t.status === 'done' ? '✓' : ''}</button>}
                  <button className="agenda-main" onClick={() => onOpen(t)}>
                    <span className="agenda-title">{t.kind === 'sheet' && t.sheet_number ? <span className="mono">{t.sheet_number} </span> : null}{t.title || 'Untitled'}</span>
                    {where && <span className="agenda-where">{where}</span>}
                  </button>
                  <span className="agenda-when">
                    {t.start_date && t.due_date && t.start_date !== t.due_date ? `${shortDate(t.start_date)} – ${shortDate(t.due_date)}` : shortDate(due(t))}
                    {who.length > 0 && <AvatarStack people={who} max={2} />}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
