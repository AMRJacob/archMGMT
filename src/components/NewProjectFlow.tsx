import { useNavigate } from 'react-router-dom'
import { NewProjectDialog } from './SetupDialogs.tsx'
import { insertMany } from '../lib/data.ts'
import { useProject } from '../lib/projectContext.ts'
import type { Phase } from '../lib/types.ts'

/** The New project dialog, wired up: creates the project and its phases, then opens its Overview. */
export default function NewProjectFlow({ onClose }: { onClose: () => void }) {
  const { add, select } = useProject()
  const navigate = useNavigate()
  return (
    <NewProjectDialog onClose={onClose}
      onCreate={async (project, phases, setupFirst) => {
        const p = await add(project)
        const rows = phases.map((ph) => ({ ...ph, id: crypto.randomUUID(), project_id: p.id }))
        if (rows.length) await insertMany<Phase>('phases', rows)
        select(p.id)
        onClose()
        navigate(setupFirst && rows[0] ? `/overview?setup=${rows[0].id}` : '/overview')
      }} />
  )
}
