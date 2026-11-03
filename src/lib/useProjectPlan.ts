import { useCallback, useEffect, useRef, useState } from 'react'
import { useRows } from './data.ts'
import { addDays, daysBetween } from './dates.ts'
import type { Person, Phase, Task } from './types.ts'

type Change = { table: 'tasks' | 'phases'; id: string; prev: Record<string, unknown>; next: Record<string, unknown> }

function pick<T extends object>(row: T, keys: string[]): Record<string, unknown> {
  const r = row as Record<string, unknown>
  return Object.fromEntries(keys.map((k) => [k, r[k]]))
}

export function shiftDates(t: Pick<Task, 'start_date' | 'due_date'>, days: number) {
  return {
    start_date: t.start_date ? addDays(t.start_date, days) : null,
    due_date: t.due_date ? addDays(t.due_date, days) : null,
  }
}

/**
 * A project's phases, tasks and the office's people, with edit helpers and undo.
 * Drags and moves are recorded so Undo (button or Ctrl+Z) puts them back.
 */
export function useProjectPlan(projectId: string) {
  const phases = useRows<Phase>('phases', { project_id: projectId })
  const tasks = useRows<Task>('tasks', { project_id: projectId })
  const people = useRows<Person>('people')
  const history = useRef<Change[][]>([])
  const [undoCount, setUndoCount] = useState(0)

  const run = useCallback((changes: Change[]) => {
    for (const c of changes) {
      if (c.table === 'tasks') void tasks.patch(c.id, c.next as Partial<Task>)
      else void phases.patch(c.id, c.next as Partial<Phase>)
    }
  }, [tasks, phases])

  const apply = useCallback((changes: Change[]) => {
    if (!changes.length) return
    run(changes)
    history.current = [...history.current.slice(-49), changes]
    setUndoCount(history.current.length)
  }, [run])

  const undo = useCallback(() => {
    const last = history.current[history.current.length - 1]
    if (!last) return
    history.current = history.current.slice(0, -1)
    setUndoCount(history.current.length)
    run(last.map((c) => ({ ...c, next: c.prev, prev: c.next })))
  }, [run])

  const taskChange = (t: Task, next: Partial<Task>): Change =>
    ({ table: 'tasks', id: t.id, prev: pick(t, Object.keys(next)), next })

  /** Edit a task. Pass record=false for plain field edits that don't need undo. */
  const patchTask = useCallback((t: Task, next: Partial<Task>, record = true) => {
    if (record) apply([taskChange(t, next)])
    else void tasks.patch(t.id, next)
  }, [apply, tasks])

  const shiftTask = useCallback((t: Task, days: number) => {
    if (days) apply([taskChange(t, shiftDates(t, days))])
  }, [apply])

  /** Move or resize a phase. When the whole phase moves, its tasks move with it. */
  const movePhase = useCallback((p: Phase, start: string, end: string, withTasks: boolean) => {
    const changes: Change[] = [{ table: 'phases', id: p.id, prev: pick(p, ['start_date', 'end_date']), next: { start_date: start, end_date: end } }]
    const delta = daysBetween(p.start_date, start)
    if (withTasks && delta) {
      for (const t of tasks.rows.filter((x) => x.phase_id === p.id)) changes.push(taskChange(t, shiftDates(t, delta)))
    }
    apply(changes)
  }, [apply, tasks.rows])

  // Ctrl/Cmd+Z, except while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select')) return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undo])

  return { phases, tasks, people, patchTask, shiftTask, movePhase, undo, canUndo: undoCount > 0 }
}
