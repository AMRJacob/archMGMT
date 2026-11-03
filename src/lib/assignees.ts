import type { Person, Task } from './types.ts'

/** Everyone on a task, lead first. Older rows only have assignee_id. */
export function assigneesOf(t: Pick<Task, 'assignee_id' | 'assignee_ids'>): string[] {
  if (t.assignee_ids && t.assignee_ids.length) return t.assignee_ids
  return t.assignee_id ? [t.assignee_id] : []
}

/** The change that sets who's on a task (keeps the lead column in step). */
export function assignPatch(ids: string[]): Pick<Task, 'assignee_id' | 'assignee_ids'> {
  const unique = [...new Set(ids)]
  return { assignee_ids: unique, assignee_id: unique[0] ?? null }
}

export const isAssigned = (t: Pick<Task, 'assignee_id' | 'assignee_ids'>, personId: string) => assigneesOf(t).includes(personId)

export function initialsOf(p: Person | undefined): string {
  if (!p) return ''
  return p.initials ?? p.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3)
}

/** "SA" or "SA+BJ" or "SA+2": short label for tight places like the timeline and calendar. */
export function whoLabel(t: Pick<Task, 'assignee_id' | 'assignee_ids'>, people: Person[]): string {
  const ids = assigneesOf(t)
  if (!ids.length) return ''
  const first = initialsOf(people.find((p) => p.id === ids[0]))
  if (ids.length === 1) return first
  if (ids.length === 2) return `${first}+${initialsOf(people.find((p) => p.id === ids[1]))}`
  return `${first}+${ids.length - 1}`
}
