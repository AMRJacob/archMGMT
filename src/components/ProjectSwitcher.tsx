import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '../lib/projectContext.ts'
import { PROJECT_STATUSES } from '../lib/types.ts'
import { projectAccent } from '../lib/colors.ts'

/** The current project; click it to switch to another. Same behaviour as CAzen's switcher. */
export default function ProjectSwitcher() {
  const { projects, current, select } = useProject()
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
          <button className="ps-all" onClick={() => { setOpen(false); navigate('/') }}>
            {projects.length ? 'All projects' : 'Create a project'}
          </button>
        </div>
      )}
    </div>
  )
}
