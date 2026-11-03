import { addDays, parseISO } from './dates.ts'
import type { Person, Project, Task, TimeOff } from './types.ts'

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

/**
 * A task's estimated hours spread evenly over the weekdays between its start and due dates,
 * totalled by week (keyed by that week's Monday).
 */
export function taskHoursByWeek(t: Task): Map<string, number> {
  const out = new Map<string, number>()
  if (t.is_milestone || !t.estimated_hours) return out
  let s = t.start_date ?? t.due_date
  let e = t.due_date ?? t.start_date
  if (!s || !e) return out
  if (e < s) [s, e] = [e, s]
  const days: string[] = []
  for (let d = s; d <= e; d = addDays(d, 1)) if (isWeekday(d)) days.push(d)
  if (days.length === 0) days.push(s)
  const perDay = t.estimated_hours / days.length
  for (const d of days) {
    const w = mondayOf(d)
    out.set(w, (out.get(w) ?? 0) + perDay)
  }
  return out
}

/** Hours a person is available in a week: their weekly hours less weekdays off. */
export function capacityForWeek(p: Person, week: string, timeOff: TimeOff[]): number {
  let off = 0
  for (let i = 0; i < 5; i++) {
    const d = addDays(week, i)
    if (timeOff.some((o) => o.person_id === p.id && o.start_date <= d && d <= o.end_date)) off++
  }
  return (p.weekly_hours * (5 - off)) / 5
}

/** Tasks that count toward workload: open tasks on projects that aren't complete or on hold. */
export function countsTowardWorkload(t: Task, projects: Map<string, Project>): boolean {
  if (t.status === 'done') return false
  const p = projects.get(t.project_id)
  return !!p && p.status !== 'complete' && p.status !== 'on_hold'
}

export type LoadLevel = 'none' | 'light' | 'good' | 'full' | 'over'

export function loadLevel(hours: number, capacity: number): LoadLevel {
  if (hours < 0.5) return 'none'
  if (capacity <= 0) return 'over'
  const r = hours / capacity
  if (r < 0.6) return 'light'
  if (r <= 0.9) return 'good'
  if (r <= 1.05) return 'full'
  return 'over'
}
