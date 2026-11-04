import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { list } from '../lib/data.ts'
import { useProject } from '../lib/projectContext.ts'
import type { MeetingNote, Person, Phase, Task } from '../lib/types.ts'

interface Hit { key: string; group: string; title: string; sub: string; go: () => void }

/** Search everything: projects, tasks and sheets, meeting notes, people. Ctrl+K (⌘K) or the sidebar button. */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const k = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])
  return (
    <>
      <button className="search-launch" onClick={() => setOpen(true)} title="Search (Ctrl+K)">
        <span>Search</span><kbd>Ctrl K</kbd>
      </button>
      {open && <SearchPalette onClose={() => setOpen(false)} />}
    </>
  )
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { projects, select } = useProject()
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const [data, setData] = useState<{ tasks: Task[]; phases: Phase[]; notes: MeetingNote[]; people: Person[] } | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let live = true
    void Promise.all([list<Task>('tasks'), list<Phase>('phases'), list<MeetingNote>('meeting_notes'), list<Person>('people')])
      .then(([tasks, phases, notes, people]) => { if (live) setData({ tasks, phases, notes, people }) })
      .catch(() => { if (live) setData({ tasks: [], phases: [], notes: [], people: [] }) })
    return () => { live = false }
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const has = (...vals: (string | null | undefined)[]) => { const s = vals.filter(Boolean).join(' ').toLowerCase(); return words.every((w) => s.includes(w)) }
    const pname = (id: string) => { const p = projects.find((x) => x.id === id); return p ? [p.number, p.name].filter(Boolean).join(' · ') : '' }
    const done = (fn: () => void) => () => { onClose(); fn() }
    const out: Hit[] = []
    for (const p of projects) {
      if (has(p.number, p.name, p.client, p.building_type, p.notes))
        out.push({ key: `p${p.id}`, group: 'Projects', title: [p.number, p.name].filter(Boolean).join(' · '), sub: [p.building_type, p.archived_at ? 'Archived' : p.status].filter(Boolean).join(' · '),
          go: done(() => { select(p.id); navigate('/overview') }) })
    }
    if (data) {
      for (const t of data.tasks) {
        if (!projects.some((p) => p.id === t.project_id)) continue
        if (has(t.title, t.notes))
          out.push({ key: `t${t.id}`, group: 'Tasks & sheets', title: t.title || 'Untitled', sub: [pname(t.project_id), data.phases.find((ph) => ph.id === t.phase_id)?.name].filter(Boolean).join(' · '),
            go: done(() => { select(t.project_id); navigate(`/overview?find=${t.id}`) }) })
      }
      for (const n of data.notes) {
        if (!projects.some((p) => p.id === n.project_id)) continue
        if (has(n.title, n.body, n.decisions, n.attendees, n.location, ...(n.actions ?? []).map((a) => a.text)))
          out.push({ key: `n${n.id}`, group: 'Meeting notes', title: n.title || 'Meeting', sub: [pname(n.project_id), n.meeting_date].filter(Boolean).join(' · '),
            go: done(() => { select(n.project_id); navigate(`/notes?open=${n.id}`) }) })
      }
      for (const p of data.people) {
        if (has(p.name, p.company, p.role, p.discipline, p.email))
          out.push({ key: `u${p.id}`, group: 'People', title: p.name, sub: [p.role, p.company].filter(Boolean).join(' · '), go: done(() => navigate('/team')) })
      }
    }
    // Keep each group short; groups in a fixed order.
    const order = ['Projects', 'Tasks & sheets', 'Meeting notes', 'People']
    return order.flatMap((g) => out.filter((h) => h.group === g).slice(0, 8))
  }, [q, data, projects, select, navigate, onClose])

  useEffect(() => { listRef.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' }) }, [at])

  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') hits[at]?.go()
  }

  return createPortal(
    <div className="search-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="search-box" role="dialog" aria-label="Search">
        <input autoFocus className="search-input" placeholder="Search projects, tasks, sheets, notes, people…" value={q} onChange={(e) => { setQ(e.target.value); setAt(0) }} onKeyDown={keys} />
        <ul className="search-hits" ref={listRef}>
          {q.trim() && !data && <li className="muted small search-empty">Searching…</li>}
          {q.trim() && data && hits.length === 0 && <li className="muted small search-empty">Nothing matches “{q.trim()}”.</li>}
          {hits.map((h, i) => (
            <li key={h.key}>
              {(i === 0 || hits[i - 1].group !== h.group) && <div className="search-group">{h.group}</div>}
              <button className={i === at ? 'on' : ''} onMouseEnter={() => setAt(i)} onClick={h.go}>
                <span className="search-title">{h.title}</span>
                {h.sub && <span className="muted small">{h.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="search-foot muted small">↑↓ to move · Enter to open · Esc to close</div>
      </div>
    </div>,
    document.body,
  )
}
