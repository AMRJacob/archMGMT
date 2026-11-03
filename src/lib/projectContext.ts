import { createContext, useContext } from 'react'
import type { Project } from './types.ts'

export interface ProjectState {
  projects: Project[]
  /** The project the project-level pages (Overview, Schedule) are showing. */
  current: Project | null
  select: (id: string | null) => void
  patch: (id: string, changes: Partial<Project>) => Promise<void>
  add: (row: Partial<Project>) => Promise<Project>
  drop: (id: string) => Promise<void>
  reload: () => Promise<void>
  loading: boolean
  error: string | null
}

export const ProjectContext = createContext<ProjectState | null>(null)

export function useProject(): ProjectState {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}

/** Newest project numbers first, as in CAzen. */
export function sortProjects(ps: Project[]): Project[] {
  return [...ps].sort((a, b) => (b.number ?? '').localeCompare(a.number ?? '') || a.name.localeCompare(b.name))
}
