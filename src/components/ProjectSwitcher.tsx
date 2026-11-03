import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { insertMany } from '../lib/data.ts'
import { nextMonday } from '../lib/dates.ts'
import { defaultPhaseRows } from '../lib/phases.ts'
import { useProject } from '../lib/projectContext.ts'
import { PROJECT_STATUSES, type Phase } from '../lib/types.ts'
import { projectAccent } from '../lib/colors.ts'

/** The current project; click it to switch to another. Same behaviour as CAzen's switcher. */
export default function ProjectSwitcher() {
  const { projects, current, select, add } = useProject()
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const pick = (id: string) => { select(id); setOpen(false) }

  /** New project with the standard phases from next Monday; opens its Overview to name it. */
  async function createProject() {
    setCreating(true)
    try {
      const p = await add({ name: 'New project', status: 'active' })
      await insertMany<Phase>('phases', defaultPhaseRows(p.id, nextMonday()))
      select(p.id)
      setOpen(false)
      navigate('/overview?new=1')
    } finally {
      setCreating(false)
    }
  }
  const statusLabel = (s: string) => PROJECT_STATUSES.find((x) => x.value === s)?.label ?? s

  return (
    <div className="context" ref={box}>
      <button className={`project-switch${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="ps-text">
          {current ? (
            <>
              <span className="ps-number">{current.number ?? 'No number'}</span>
              <span className="ps-name"><span className="pdot" style={{ background: projectAccent(current.color).accent }} />{current.name}</span>
            </>
          ) : (
            <span className="ps-name ps-empty">{projects.length ? 'Choose a project' : 'No projects yet'}</span>
          )}
        </span>
        <svg className="ps-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="ps-menu" role="listbox" aria-label="Projects">
          {projects.map((p) => (
            <button key={p.id} role="option" aria-selected={p.id === current?.id} className={p.id === current?.id ? 'on' : ''} onClick={() => pick(p.id)}>
              <span className="ps-number">
                {p.number ?? '—'}
                {p.status !== 'active' && <span className="ps-status"> · {statusLabel(p.status)}</span>}
              </span>
              <span className="ps-name"><span className="pdot" style={{ background: projectAccent(p.color).accent }} />{p.name}</span>
            </button>
          ))}
          <button className="ps-new" onClick={createProject} disabled={creating}>+ New project</button>
          {projects.length > 0 && <button className="ps-all" onClick={() => { setOpen(false); navigate('/') }}>All projects</button>}
        </div>
      )}
    </div>
  )
}
