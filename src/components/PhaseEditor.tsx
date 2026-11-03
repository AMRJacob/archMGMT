import Modal from './Modal.tsx'
import { DateField, TextField } from './fields.tsx'
import type { Phase } from '../lib/types.ts'

export default function PhaseEditor({ phase, taskCount, onPatch, onDelete, onClose }: {
  phase: Phase
  taskCount: number
  onPatch: (changes: Partial<Phase>) => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <Modal
      onClose={onClose}
      title={<TextField value={phase.name} className="big" onSave={(v) => v && onPatch({ name: v })} />}
      footer={
        <>
          <button className="btn danger" onClick={() => {
            if (window.confirm(`Delete the ${phase.name} phase?${taskCount ? ` Its ${taskCount} task(s) will move to "No phase".` : ''}`)) { onDelete(); onClose() }
          }}>Delete phase</button>
          <button className="btn primary" onClick={onClose}>Done</button>
        </>
      }
    >
      <div className="form-grid two">
        <label>Start<DateField required value={phase.start_date} onSave={(v) => v && onPatch({ start_date: v })} /></label>
        <label>End<DateField required value={phase.end_date} onSave={(v) => v && onPatch({ end_date: v })} /></label>
      </div>
      <div className="form-checks">
        <label className="inline-check">
          <input type="checkbox" checked={phase.client_visible} onChange={(e) => onPatch({ client_visible: e.target.checked })} />
          Show in presentation view
        </label>
      </div>
      <p className="muted small">Tip: on the Schedule timeline you can drag a phase to move it with all its tasks.</p>
    </Modal>
  )
}
