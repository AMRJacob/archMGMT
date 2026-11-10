import type { Task } from './types.ts'

/**
 * What a phase holds, by its top-level rows (everything under a row goes with it: the database cascades).
 * Used to clear a phase for a fresh setup and to delete a phase with its contents.
 */
export interface PhaseContents {
  sheets: Task[]
  sections: Task[]
  tasks: Task[]
  milestones: Task[]
}

export function phaseContents(rows: Task[], phaseId: string): PhaseContents {
  const top = rows.filter((t) => t.phase_id === phaseId && !t.parent_id)
  return {
    sheets: top.filter((t) => t.kind === 'sheet'),
    sections: top.filter((t) => t.kind === 'section'),
    milestones: top.filter((t) => t.kind !== 'sheet' && t.kind !== 'section' && t.is_milestone),
    tasks: top.filter((t) => t.kind !== 'sheet' && t.kind !== 'section' && !t.is_milestone),
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "3 sheets, 5 tasks and 2 milestones", or '' when empty. */
export function describeContents(c: PhaseContents): string {
  const parts = [
    c.sheets.length && plural(c.sheets.length, 'sheet'),
    c.sections.length && plural(c.sections.length, 'spec section'),
    c.tasks.length && plural(c.tasks.length, 'task'),
    c.milestones.length && plural(c.milestones.length, 'milestone'),
  ].filter(Boolean) as string[]
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? ''
}

/** The confirm text for deleting a phase and everything in it. */
export function deletePhaseQuestion(name: string, rows: Task[], phaseId: string): string {
  const c = phaseContents(rows, phaseId)
  const what = describeContents(c)
  const under = c.sheets.length || c.sections.length ? 'tasks and subtasks' : 'subtasks'
  return what
    ? `Delete the ${name} phase and everything in it (${what}, with their ${under})? This can't be undone. Copies of carried sheets in other phases stay.`
    : `Delete the ${name} phase?`
}
