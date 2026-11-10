import type { Phase, Task } from './types.ts'
import { sheetTypeById } from './sheetTypes.ts'

/**
 * Sheets carried through phases. A drawing usually runs from SD through CD: each phase has its own row for
 * it (so that phase's tasks show in that phase), and the rows share a `sheet_link`. Linked rows keep the
 * same number, name and type (data.ts keeps them in step); the detail added in each phase stays in that phase.
 */

/** Phases in project order. */
export const phaseOrder = (phases: Phase[]) =>
  [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))

/** The other phases' copies of a sheet (not itself). */
export function linkedCopies(tasks: Iterable<Task>, sheet: Task): Task[] {
  if (!sheet.sheet_link) return []
  return [...tasks].filter((t) => t.id !== sheet.id && t.kind === 'sheet' && t.sheet_link === sheet.sheet_link)
}

/** Phases a sheet appears in (its own included), in project order. */
export function phasesOfSheet(tasks: Iterable<Task>, phases: Phase[], sheet: Task): Phase[] {
  const ids = new Set([sheet.phase_id, ...linkedCopies(tasks, sheet).map((t) => t.phase_id)])
  return phaseOrder(phases).filter((p) => ids.has(p.id))
}

/** Short label for a phase: SD, DD, CD… or its initials. */
export function phaseShort(p: Phase): string {
  const known: [RegExp, string][] = [
    [/pre-?design/i, 'PD'], [/schematic/i, 'SD'], [/design dev/i, 'DD'], [/construction doc/i, 'CD'],
    [/bid|procure/i, 'BID'], [/construction admin|^ca\b/i, 'CA'], [/ff&?e/i, 'FF&E'],
  ]
  for (const [re, s] of known) if (re.test(p.name)) return s
  return p.name.split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase().slice(0, 3) || p.name
}

/**
 * Sheets from phases before `phase` that aren't in it yet, one per drawing (the latest copy), in sheet order.
 * These are what a later phase can carry forward.
 */
export function sheetsBefore(tasks: Task[], phases: Phase[], phase: Phase): Task[] {
  const order = phaseOrder(phases)
  const at = order.findIndex((p) => p.id === phase.id)
  const rank = new Map(order.map((p, i) => [p.id, i]))
  const earlier = new Set(order.slice(0, Math.max(0, at)).map((p) => p.id))
  const here = new Set(tasks.filter((t) => t.kind === 'sheet' && t.phase_id === phase.id && !t.parent_id && t.sheet_link).map((t) => t.sheet_link!))
  const latest = new Map<string, Task>()
  for (const t of tasks) {
    if (t.kind !== 'sheet' || t.parent_id || !t.phase_id || !earlier.has(t.phase_id)) continue
    const key = t.sheet_link ?? t.id
    if (t.sheet_link && here.has(t.sheet_link)) continue
    const prev = latest.get(key)
    if (!prev || (rank.get(t.phase_id) ?? 0) > (rank.get(prev.phase_id!) ?? 0)) latest.set(key, t)
  }
  return [...latest.values()].sort((a, b) =>
    (a.sheet_number ?? '~').localeCompare(b.sheet_number ?? '~', undefined, { numeric: true }) || a.title.localeCompare(b.title))
}

/**
 * Rows that carry `source` into `phase`: the same sheet (number, name, type, people) dated to the phase,
 * optionally with its type's standard subtasks. `linkSource` is set when the source isn't linked yet and
 * needs the new link id saved on it.
 */
export function carryRows(source: Task, phase: Phase, opts: { sortOrder: number; withSubtasks?: boolean }) {
  const link = source.sheet_link ?? crypto.randomUUID()
  const id = crypto.randomUUID()
  const type = sheetTypeById(source.sheet_type)
  const sheet: Partial<Task> = {
    id, project_id: source.project_id, phase_id: phase.id, parent_id: null, kind: 'sheet',
    sheet_number: source.sheet_number ?? null, sheet_type: source.sheet_type ?? 'other', sheet_link: link, title: source.title,
    assignee_id: source.assignee_id ?? null, assignee_ids: source.assignee_ids ?? (source.assignee_id ? [source.assignee_id] : []),
    start_date: phase.start_date, due_date: phase.end_date, estimated_hours: null, effort: source.effort ?? type?.effort ?? 2,
    status: 'todo', is_milestone: false, client_visible: source.client_visible, sort_order: opts.sortOrder, notes: null,
  }
  const items: Partial<Task>[] = opts.withSubtasks && type ? type.checklist.map((title, i) => ({
    id: crypto.randomUUID(), project_id: source.project_id, phase_id: phase.id, parent_id: id, kind: 'item', title,
    status: 'todo', is_milestone: false, client_visible: false, sort_order: i, effort: null, start_date: null, due_date: null,
    assignee_id: null, assignee_ids: [],
  })) : []
  return { sheet, items, link, linkSource: source.sheet_link ? null : link }
}

/** A sheet's type for a hint line, unless its name already says it. */
export const typeHint = (t: Task) => { const n = sheetTypeById(t.sheet_type)?.name; return n && n !== t.title ? `${n} · ` : '' }
