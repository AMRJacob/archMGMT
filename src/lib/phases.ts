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
