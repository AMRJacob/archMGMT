import { addDays } from './dates.ts'
import { DEFAULT_PHASES } from './types.ts'

/** A project's standard phases, back to back from a start date. */
export function defaultPhaseRows(projectId: string, start: string) {
  let cursor = start
  return DEFAULT_PHASES.map((p, i) => {
    const row = {
      project_id: projectId,
      name: p.name,
      sort_order: i,
      start_date: cursor,
      end_date: addDays(cursor, p.weeks * 7 - 1),
      client_visible: true,
    }
    cursor = addDays(cursor, p.weeks * 7)
    return row
  })
}

/** Bar colours for phases, by position: muted, print-friendly. */
const PHASE_COLORS = ['#8b9a96', '#6f8fa6', '#5f7a61', '#b5502d', '#c08a3e', '#4a5a78', '#8a6f9e', '#5a8a8a']

export function phaseColor(index: number): string {
  return PHASE_COLORS[index % PHASE_COLORS.length]
}
