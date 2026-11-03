import { useEffect } from 'react'
import { DateField, NumberField, SelectField, TextField } from './fields.tsx'
import PersonOptions from './PersonOptions.tsx'
import { TASK_STATUSES, type Person, type Phase, type Task, type TaskStatus } from '../lib/types.ts'

/** One place to edit every detail of a task. Changes save as you go. */
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
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-label="Edit task">
        <div className="modal-head">
          <div className="task-title big">
            {task.is_milestone && <span className="diamond" title="Milestone" />}
            <TextField value={task.title} onSave={(v) => v && onPatch({ title: v })} />
          </div>
          <button className="icon-btn close" title="Close" onClick={onClose}>×</button>
        </div>

        <div className="modal-grid">
          <label>Status
            <SelectField<TaskStatus> value={task.status} className={`status ${task.status}`} onSave={(v) => v && onPatch({ status: v })}>
              {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SelectField>
          </label>
          <label>Assigned to
            <SelectField value={task.assignee_id} onSave={(v) => onPatch({ assignee_id: v })}>
              <PersonOptions people={people} />
            </SelectField>
          </label>
          <label>Phase
            <SelectField value={task.phase_id} onSave={(v) => onPatch({ phase_id: v })}>
              <option value="">No phase</option>
              {sorted.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
          </label>
          {!task.is_milestone && (
            <label>Start<DateField value={task.start_date} onSave={(v) => onPatch({ start_date: v })} /></label>
          )}
          <label>{task.is_milestone ? 'Date' : 'Due'}<DateField value={task.due_date} onSave={(v) => onPatch({ due_date: v })} /></label>
          {!task.is_milestone && (
            <label>Estimated hours<NumberField value={task.estimated_hours} placeholder="—" onSave={(v) => onPatch({ estimated_hours: v })} /></label>
          )}
        </div>

        <div className="modal-checks">
          <label className="inline-check">
            <input type="checkbox" checked={task.client_visible} onChange={(e) => onPatch({ client_visible: e.target.checked })} />
            Show in presentation view
          </label>
          <label className="inline-check">
            <input type="checkbox" checked={task.is_milestone}
              onChange={(e) => onPatch(e.target.checked
                ? { is_milestone: true, start_date: null, estimated_hours: null }
                : { is_milestone: false, start_date: task.due_date })} />
            Milestone (a single date, like a review or submission)
          </label>
        </div>

        <div className="modal-foot">
          <button className="btn danger" onClick={() => { if (window.confirm(`Delete "${task.title}"?`)) { onDelete(); onClose() } }}>Delete task</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
