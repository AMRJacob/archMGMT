import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext.ts'
import { DateChip, MilestoneMark, SizeChip, StatusChip } from '../components/TaskChips.tsx'
import { TextField } from '../components/fields.tsx'
import { isAssigned } from '../lib/assignees.ts'
import { phaseColors, projectDot } from '../lib/colors.ts'
import { useRows } from '../lib/data.ts'
import { addDays, formatDate, today } from '../lib/dates.ts'
import { useProject } from '../lib/projectContext.ts'
import { buildTree, isSheetWork, isWorkLeaf } from '../lib/tree.ts'
import type { Person, Phase, Task } from '../lib/types.ts'
import { mondayOf } from '../lib/workload.ts'

type Due = 'all' | 'overdue' | 'week' | 'two' | 'nodate'
type Kind = 'all' | 'general' | 'sheets'
type Group = 'project' | 'due'

/** Saved per browser, so the page opens the way you left it. */
function useSaved<T extends string | boolean>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s === null ? initial : (JSON.parse(s) as T) } catch { return initial }
  })
  return [v, (n: T) => { setV(n); try { localStorage.setItem(key, JSON.stringify(n)) } catch { /* private mode */ } }]
}

/**
 * My To Do: everything assigned to the signed-in person across all active projects (matched to the Team list by
 * email). Work you can do (the bottom level of each branch, plus milestones), open by default; completed optional.
 * Filter by project, kind and due date, or search; group by project or by when it's due. Tick things off here.
 */
export default function MyTodo() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const { projects, select } = useProject()
  const tasks = useRows<Task>('tasks')
  const phases = useRows<Phase>('phases')
  const people = useRows<Person>('people')
  const [showDone, setShowDone] = useSaved<boolean>('archmgmt.todo.done', false)
  const [projectId, setProjectId] = useSaved<string>('archmgmt.todo.project', '')
  const [kind, setKind] = useSaved<Kind>('archmgmt.todo.kind', 'all')
  const [due, setDue] = useSaved<Due>('archmgmt.todo.due', 'all')
  const [group, setGroup] = useSaved<Group>('archmgmt.todo.group', 'project')
  const [showDesc, setShowDesc] = useSaved<boolean>('archmgmt.todo.desc', false)
  const [q, setQ] = useState('')

  const email = session?.user.email?.toLowerCase() ?? null
  const me = email ? people.rows.find((p) => (p.email ?? '').toLowerCase() === email) ?? null : null
  const t0 = today()
  const weekEnd = addDays(mondayOf(t0), 6), twoEnd = addDays(t0, 14)

  const live = projects.filter((p) => !p.archived_at)
  const liveIds = new Set(live.map((p) => p.id))
  const tree = buildTree(tasks.rows)
  const mine = me ? tasks.rows.filter((t) => liveIds.has(t.project_id) && t.kind !== 'item' && isAssigned(t, me.id)
    && (t.is_milestone || isWorkLeaf(tree, t))) : []
  const dueOf = (t: Task) => t.due_date ?? t.start_date
  const shown = mine.filter((t) => {
    if (!showDone && t.status === 'done') return false
    if (projectId && t.project_id !== projectId) return false
    if (kind !== 'all' && (kind === 'sheets') !== isSheetWork(tree, t)) return false
    const d = dueOf(t)
    if (due === 'overdue' && !(d && d < t0 && t.status !== 'done')) return false
    if (due === 'week' && !(d && d <= weekEnd)) return false
    if (due === 'two' && !(d && d <= twoEnd)) return false
    if (due === 'nodate' && d) return false
    if (q.trim() && !t.title.toLowerCase().includes(q.trim().toLowerCase())) return false
    return true
  }).sort((a, b) => (dueOf(a) ?? '9999').localeCompare(dueOf(b) ?? '9999') || a.title.localeCompare(b.title))

  const projectOf = (t: Task) => projects.find((p) => p.id === t.project_id)
  const phaseOf = (t: Task) => phases.rows.find((p) => p.id === t.phase_id)
  const colorOfPhase = (t: Task) => {
    const p = projectOf(t)
    return p ? phaseColors(p, phases.rows.filter((x) => x.project_id === p.id)).get(t.phase_id ?? '') : undefined
  }
  const sheetOf = (t: Task) => { let c: Task | undefined = t; for (let n = 0; c && n < 12; n++) { if (c.kind === 'sheet') return c; c = c.parent_id ? tree.byId.get(c.parent_id) : undefined } return null }
  const open = (t: Task) => { select(t.project_id); navigate('/overview') }
  const patch = (t: Task, c: Partial<Task>) => void tasks.patch(t.id, c)

  // Groups: by project (in project order), or by when it's due.
  const groups: { key: string; title: string; dot?: string; items: Task[] }[] = []
  if (group === 'project') {
    for (const p of live) {
      const items = shown.filter((t) => t.project_id === p.id)
      if (items.length) groups.push({ key: p.id, title: `${p.number ? `${p.number} · ` : ''}${p.name}`, dot: projectDot(p), items })
    }
  } else {
    const bucket = (t: Task) => {
      const d = dueOf(t)
      if (!d) return 'No date'
      if (d < t0) return t.status === 'done' ? 'Earlier' : 'Overdue'
      if (d <= weekEnd) return 'This week'
      if (d <= addDays(weekEnd, 7)) return 'Next week'
      return 'Later'
    }
    for (const b of ['Overdue', 'This week', 'Next week', 'Later', 'No date', 'Earlier']) {
      const items = shown.filter((t) => bucket(t) === b)
      if (items.length) groups.push({ key: b, title: b, items })
    }
  }
  const row = (t: Task) => {
    const ph = phaseOf(t), sh = sheetOf(t), pr = projectOf(t)
    const c = colorOfPhase(t)
    const d = dueOf(t)
    return (
      <li key={t.id} className={`todo-row${t.status === 'done' ? ' done' : ''}${showDesc ? ' with-desc' : ''}`}>
        <div className="todo-line">
          <input type="checkbox" className="todo-tick" checked={t.status === 'done'} title={t.status === 'done' ? 'Mark not done' : 'Mark done'}
            onChange={(e) => patch(t, { status: e.target.checked ? 'done' : 'todo' })} />
          <div className="todo-main">
            <button className="todo-title" onClick={() => open(t)} title="Open in the project's Overview">
              {t.is_milestone && <MilestoneMark task={t} />}
              {t.kind === 'sheet' && t.sheet_number && <span className="mono todo-no">{t.sheet_number}</span>}
              {t.title || 'Untitled'}
              {!showDesc && t.notes && <span className="has-desc" title={t.notes}>≡</span>}
            </button>
            <div className="todo-meta muted small">
              {group === 'due' && pr && <span><i className="pdot" style={{ background: projectDot(pr) }} />{pr.name}</span>}
              {ph && <span><i className="phase-sq" style={{ background: c }} />{ph.name}</span>}
              {sh && sh.id !== t.id && <span className="todo-sheet">{sh.sheet_number ? `${sh.sheet_number} ` : ''}{sh.title}</span>}
              {d && d < t0 && t.status !== 'done' && <span className="late">Overdue since {formatDate(d)}</span>}
            </div>
          </div>
          <span className="todo-chips">
            <StatusChip task={t} onPatch={(x) => patch(t, x)} />
            {!t.is_milestone && <SizeChip task={t} onPatch={(x) => patch(t, x)} />}
            <DateChip task={t} onPatch={(x) => patch(t, x)} />
          </span>
        </div>
        {showDesc && (
          <TextField multiline value={t.notes ?? null} placeholder="Add a description…" className="todo-desc"
            onSave={(v) => patch(t, { notes: v })} />
        )}
      </li>
    )
  }
  const openCount = mine.filter((t) => t.status !== 'done').length
  const overdue = mine.filter((t) => { const d = dueOf(t); return d && d < t0 && t.status !== 'done' }).length

  return (
    <section className="todo-page">
      <header className="page-head">
        <div>
          <h1>My To Do</h1>
          <p className="muted">
            {me ? <>{me.name} · {openCount} open{overdue ? <>, <span className="late">{overdue} overdue</span></> : ''} across {new Set(mine.map((t) => t.project_id)).size} project{new Set(mine.map((t) => t.project_id)).size === 1 ? '' : 's'}</>
              : 'Everything assigned to you, across all projects.'}
          </p>
        </div>
      </header>

      {!me ? (
        <div className="card pad">
          <p>{session ? <>Your account isn’t linked to the Team list yet. Add your name under <strong>Settings &amp; Data → Access → Your name</strong>, then your tasks show here.</> : 'Sign in to see the tasks assigned to you.'}</p>
        </div>
      ) : (
        <>
          <div className="subbar todo-filters">
            <input className="field boxed todo-search" placeholder="Search my tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="field boxed small-select" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project">
              <option value="">All projects</option>
              {live.filter((p) => mine.some((t) => t.project_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.number ? `${p.number} · ` : ''}{p.name}</option>)}
            </select>
            <div className="segmented small-seg" aria-label="Kind">
              {([['all', 'All'], ['general', 'General Tasks'], ['sheets', 'Sheets']] as [Kind, string][]).map(([k, l]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}
            </div>
            <select className="field boxed small-select" value={due} onChange={(e) => setDue(e.target.value as Due)} aria-label="Due">
              <option value="all">Any date</option>
              <option value="overdue">Overdue</option>
              <option value="week">Due this week</option>
              <option value="two">Due in the next 2 weeks</option>
              <option value="nodate">No date</option>
            </select>
            <span className="grow" />
            <div className="segmented small-seg" aria-label="Group by">
              <button className={group === 'project' ? 'on' : ''} onClick={() => setGroup('project')}>By project</button>
              <button className={group === 'due' ? 'on' : ''} onClick={() => setGroup('due')}>By due date</button>
            </div>
            <label className="inline-check"><input type="checkbox" checked={showDesc} onChange={(e) => setShowDesc(e.target.checked)} />Show descriptions</label>
            <label className="inline-check"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show completed</label>
          </div>

          {groups.length === 0 && <div className="card pad"><p className="muted">{mine.length ? 'Nothing matches these filters.' : 'Nothing is assigned to you right now.'}</p></div>}
          {groups.map((g) => (
            <div key={g.key} className="todo-group">
              <div className="todo-head">
                {g.dot && <span className="pdot" style={{ background: g.dot }} />}
                <strong>{g.title}</strong>
                <span className="count">{g.items.length}</span>
              </div>
              {/* As in the Overview: general tasks, then sheet work, each on its own panel. */}
              <ul className="tlist todo-zones">
                {([['tasks', 'General Tasks', g.items.filter((t) => !isSheetWork(tree, t))], ['sheets', 'Sheets', g.items.filter((t) => isSheetWork(tree, t))]] as const)
                  .filter(([, , list]) => list.length > 0)
                  .map(([zone, label, list]) => (
                    <li key={zone} className={`tgroup g-${zone}`}>
                      <ul className="tgroup-list">
                        <li className={`tgroup-head ${zone}`}><span>{label}</span><span className="count">{list.length}</span></li>
                        {list.map(row)}
                      </ul>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  )
}
