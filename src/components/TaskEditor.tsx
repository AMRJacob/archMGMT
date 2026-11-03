import { useEffect, useRef } from 'react'
import { TextField } from './fields.tsx'
import { TaskControls } from './TaskChips.tsx'
import type { Person, Phase, Task } from '../lib/types.ts'

/**
 * Quick panel for a task clicked in the timeline, calendar or board: the title plus the same
 * click-to-change chips as an Overview row. Changes save as you go; Esc or clicking away closes it.
 */
export default function TaskEditor({
  task, phases, people, onPatch, onDelete, onClose,
}: {
  task: Task
  phases: Phase[]
  people: Person[]
  onPatch: (changes: Partial<Task>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const away = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      // Clicking another task re-targets the panel; anything else outside closes it.
      if (!box.current?.contains(t) && !t.closest('[data-drag], .cal-task, .card-task, .trow')) onClose()
    }
    document.addEventListener('keydown', esc)
    document.addEventListener('mousedown', away)
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', away) }
  }, [onClose])

  const phase = phases.find((p) => p.id === task.phase_id)

  return (
    <div className="quick-panel" ref={box} role="dialog" aria-label="Task">
      <div className="qp-head">
        {task.is_milestone && <span className="diamond" title="Milestone" />}
        <TextField value={task.title} className="qp-title" onSave={(v) => v && onPatch({ title: v })} />
        <button className="icon-btn close" title="Close (Esc)" onClick={onClose}>×</button>
      </div>
      <div className="qp-sub muted small">{phase?.name ?? 'No phase'}{task.is_milestone ? ' · Milestone' : ''}</div>
      <TaskControls task={task} people={people} phases={phases} onPatch={onPatch} onDelete={() => { onDelete(); onClose() }} />
    </div>
  )
}
