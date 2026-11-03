import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useRows } from '../lib/data.ts'
import { ProjectContext, sortProjects } from '../lib/projectContext.ts'
import type { Project } from '../lib/types.ts'

const KEY = 'archmgmt.currentProject'

function readSaved(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
function writeSaved(id: string | null) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* private mode */ }
}

export default function ProjectProvider({ children }: { children: ReactNode }) {
  const rows = useRows<Project>('projects')
  const [currentId, setCurrentId] = useState<string | null>(readSaved())

  const projects = useMemo(() => sortProjects(rows.rows), [rows.rows])

  const select = useCallback((id: string | null) => {
    setCurrentId(id)
    writeSaved(id)
  }, [])

  // Remembered project if it still exists; otherwise the newest active one.
  const current =
    projects.find((p) => p.id === currentId) ??
    projects.find((p) => p.status === 'active' && !p.archived_at) ??
    projects.find((p) => !p.archived_at) ??
    projects[0] ??
    null

  const drop = useCallback(async (id: string) => {
    await rows.drop(id)
    if (id === currentId) select(null)
  }, [rows, currentId, select])

  return (
    <ProjectContext.Provider
      value={{
        projects, current, select, drop,
        patch: rows.patch, add: rows.add, reload: rows.reload,
        loading: rows.loading, error: rows.error,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}
