import { addDays, parseISO } from './dates.ts'
import type { Person, Project, Task, TimeOff } from './types.ts'

/**
 * Workload without hours. Each open task has a size (light 1, medium 2, heavy 3). In any week, a
 * task adds its size × the share of that week's weekdays it's active. A full-time person carries
 * about FULL_LOAD of that comfortably (e.g. three medium tasks at once); availability and time off
 * scale it down. The ratio of the two is shown as a colour, never as a number of hours.
 */

export const FULL_LOAD = 6

/** Monday of the week containing a date. */
export function mondayOf(iso: string): string {
  const dow = parseISO(iso).getUTCDay() // 0 Sun … 6 Sat
  return addDays(iso, -((dow + 6) % 7))
}

export function weekStarts(fromMonday: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(fromMonday, i * 7))
}

function isWeekday(iso: string): boolean {
  const d = parseISO(iso).getUTCDay()
  return d !== 0 && d !== 6
}

/** A task's load in each week it runs (keyed by Monday). Milestones carry no load. */
export function taskLoadByWeek(t: Task): Map<string, number> {
  const out = new Map<string, number>()
  if (t.is_milestone) return out
  let s = t.start_date ?? t.due_date
  let e = t.due_date ?? t.start_date
  if (!s || !e) return out
  if (e < s) [s, e] = [e, s]
  const size = t.effort ?? 2
  for (let d = s; d <= e; d = addDays(d, 1)) {
    if (!isWeekday(d)) continue
    const w = mondayOf(d)
    out.set(w, (out.get(w) ?? 0) + size / 5)
  }
  if (out.size === 0) out.set(mondayOf(s), size / 5) // weekend-only task
  return out
}

/** Weekdays off in a week. */
export function daysOff(p: Person, week: string, timeOff: TimeOff[]): number {
  let off = 0
  for (let i = 0; i < 5; i++) {
    const d = addDays(week, i)
    if (timeOff.some((o) => o.person_id === p.id && o.start_date <= d && d <= o.end_date)) off++
  }
  return off
}

/** How much load a person can carry in a week: availability, less days off. */
export function capacityForWeek(p: Person, week: string, timeOff: TimeOff[]): number {
  const availability = (p.availability ?? 100) / 100
  return FULL_LOAD * availability * ((5 - daysOff(p, week, timeOff)) / 5)
}

/** Tasks that count toward workload: open tasks on projects that aren't complete or on hold. */
export function countsTowardWorkload(t: Task, projects: Map<string, Project>): boolean {
  if (t.status === 'done') return false
  const p = projects.get(t.project_id)
  return !!p && !p.archived_at && p.status !== 'complete' && p.status !== 'on_hold'
}

export type LoadLevel = 'none' | 'light' | 'steady' | 'busy' | 'over'

export const LOAD_LEVELS: { value: Exclude<LoadLevel, 'none'>; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'steady', label: 'Steady' },
  { value: 'busy', label: 'Busy' },
  { value: 'over', label: 'Overloaded' },
]

export function loadLevel(load: number, capacity: number): LoadLevel {
  if (load < 0.05) return 'none'
  if (capacity <= 0) return 'over'
  const r = load / capacity
  if (r < 0.45) return 'light'
  if (r <= 0.85) return 'steady'
  if (r <= 1.15) return 'busy'
  return 'over'
}
