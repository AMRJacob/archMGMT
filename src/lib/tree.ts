import { addDays, daysBetween } from './dates.ts'
import { KIND_RANK, type Task, type TaskKind } from './types.ts'

/**
 * The hierarchy inside a phase: sheet → view → task → item, stored as tasks with parent_id.
 * Items are checklist lines / info and are never scheduled. Anything that has scheduled children
 * takes its dates from them (roll-up); only the bottom scheduled level carries workload.
 */

export const kindOf = (t: Task): TaskKind => (t.kind ?? 'task') as TaskKind
export const isItem = (t: Task) => kindOf(t) === 'item'

export interface Tree {
  byId: Map<string, Task>
  children: Map<string | null, Task[]>
}

export function buildTree(tasks: Task[]): Tree {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const children = new Map<string | null, Task[]>()
  for (const t of tasks) {
    const p = t.parent_id && byId.has(t.parent_id) ? t.parent_id : null
    children.set(p, [...(children.get(p) ?? []), t])
  }
  for (const list of children.values()) list.sort(isArranged(list) ? arrangedOrder : treeOrder)
  return { byId, children }
}

/**
 * Rows keep an automatic order (sheets by number, work by date) until someone arranges them by hand
 * (drag, insert below, paste). Arranged rows get sort_order ≥ MANUAL and keep exactly that order.
 */
export const MANUAL = 1000
export const isArranged = (list: Task[]) => list.some((t) => t.sort_order >= MANUAL)
const arrangedOrder = (a: Task, b: Task) => a.sort_order - b.sort_order || treeOrder(a, b)

/** National CAD Standard discipline order, so G-sheets come before A-sheets and so on. */
const DISCIPLINES = 'G H V B C L S A I Q F P D M E W T R X Z O'.split(' ')
function sheetKey(n: string | null | undefined): [number, string] {
  const s = (n ?? '').trim().toUpperCase()
  const i = DISCIPLINES.indexOf(s[0] ?? '')
  return [s ? (i < 0 ? DISCIPLINES.length : i) : DISCIPLINES.length + 1, s]
}

/** Sheets by number (in discipline order), then everything by date, then creation order. */
export function treeOrder(a: Task, b: Task): number {
  const ra = KIND_RANK[kindOf(a)], rb = KIND_RANK[kindOf(b)]
  if (kindOf(a) === 'sheet' && kindOf(b) === 'sheet') {
    const [da, na] = sheetKey(a.sheet_number), [db, nb] = sheetKey(b.sheet_number)
    return da - db || na.localeCompare(nb, undefined, { numeric: true }) || a.title.localeCompare(b.title)
  }
  // Sheets first (by number), then other scheduled work by date; checklist items last, in their order.
  if ((ra === 1) !== (rb === 1)) return ra === 1 ? -1 : 1
  if (ra === 4 && rb === 4) return a.sort_order - b.sort_order
  if (ra !== rb && (ra === 4 || rb === 4)) return ra - rb
  return (a.start_date ?? a.due_date ?? '9999').localeCompare(b.start_date ?? b.due_date ?? '9999') || a.sort_order - b.sort_order
}

export const childrenOf = (tree: Tree, id: string | null) => tree.children.get(id) ?? []
export const scheduledChildren = (tree: Tree, id: string) => childrenOf(tree, id).filter((c) => !isItem(c))

export function descendants(tree: Tree, id: string): Task[] {
  const out: Task[] = []
  const walk = (pid: string) => { for (const c of childrenOf(tree, pid)) { out.push(c); walk(c.id) } }
  walk(id)
  return out
}

export function depthOf(tree: Tree, t: Task): number {
  let d = 0, cur = t
  while (cur.parent_id && tree.byId.has(cur.parent_id) && d < 10) { d++; cur = tree.byId.get(cur.parent_id)! }
  return d
}

/** True for the bottom scheduled level: not an item and nothing scheduled under it. Only these carry workload. */
export const isWorkLeaf = (tree: Tree, t: Task) => !isItem(t) && scheduledChildren(tree, t.id).length === 0

/** Dates to show: own dates, or the span of everything scheduled under it. */
export function rolledDates(tree: Tree, t: Task): { start: string | null; due: string | null; rolled: boolean } {
  const kids = descendants(tree, t.id).filter((d) => !isItem(d))
  const ds = kids.flatMap((d) => [d.start_date, d.due_date]).filter((d): d is string => Boolean(d)).sort()
  if (!ds.length) return { start: t.start_date, due: t.due_date, rolled: false }
  return { start: ds[0], due: ds[ds.length - 1], rolled: true }
}

/** Checklist / work progress under a node: done vs total of leaf work and items. */
export function progressOf(tree: Tree, t: Task): { done: number; total: number } {
  const under = descendants(tree, t.id).filter((d) => isItem(d) || isWorkLeaf(tree, d))
  return { done: under.filter((d) => d.status === 'done').length, total: under.length }
}

/** Patch moving a node and everything scheduled under it by `days`. */
export function shiftTreeChanges(tree: Tree, t: Task, days: number): { task: Task; next: Partial<Task> }[] {
  if (!days) return []
  const shift = (x: Task) => ({
    task: x,
    next: { start_date: x.start_date ? addDays(x.start_date, days) : null, due_date: x.due_date ? addDays(x.due_date, days) : null },
  })
  return [t, ...descendants(tree, t.id)].filter((x) => x.start_date || x.due_date).map(shift)
}

// ---------- detail level (the slider on schedule views) ----------

export type DetailLevel = 0 | 1 | 2 | 3 // 0 phases (and milestones), 1 sheets, 2 views, 3 tasks (items are never scheduled)

export const DETAIL_LEVELS: { value: DetailLevel; label: string }[] = [
  { value: 0, label: 'Phases' },
  { value: 1, label: 'Sheets' },
  { value: 2, label: 'Views' },
  { value: 3, label: 'Tasks' },
]

/**
 * What to show at a detail level, in tree order with depth. A node shows when it's top level in its
 * phase (or a milestone), or its kind is at or above the level and its parent shows.
 * `frontier` marks the lowest shown node on each branch: what calendar and board display.
 */
export function visibleAtLevel(tree: Tree, level: DetailLevel): { task: Task; depth: number; frontier: boolean }[] {
  const out: { task: Task; depth: number; frontier: boolean }[] = []
  if (level === 0) {
    // Phases only: the phase bars themselves, plus every milestone (they mark the dates that matter).
    for (const t of tree.byId.values()) if (t.is_milestone && !isItem(t)) out.push({ task: t, depth: 0, frontier: true })
    return out.sort((a, b) => (a.task.due_date ?? '').localeCompare(b.task.due_date ?? ''))
  }
  const shows = (t: Task, parentShown: boolean, top: boolean) =>
    !isItem(t) && (top || (parentShown && (t.is_milestone || KIND_RANK[kindOf(t)] <= level)))
  const walk = (pid: string | null, depth: number) => {
    for (const t of childrenOf(tree, pid)) {
      if (!shows(t, true, pid === null)) continue
      const kids = childrenOf(tree, t.id).filter((c) => shows(c, true, false))
      out.push({ task: t, depth, frontier: kids.length === 0 })
      walk(t.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** A copy of a task carrying its shown dates and tree position, for the schedule views. */
export type ShownTask = Task & { _depth?: number; _rolled?: boolean }

export function asShown(tree: Tree, t: Task, depth: number): ShownTask {
  const r = rolledDates(tree, t)
  return { ...t, start_date: r.start, due_date: r.due, _depth: depth, _rolled: r.rolled }
}

/** How far a dragged shown copy moved, in days (its start, or due when it has no start). */
export function movedBy(orig: ShownTask, start: string | null, due: string | null): number {
  if (orig.start_date && start) return daysBetween(orig.start_date, start)
  if (orig.due_date && due) return daysBetween(orig.due_date, due)
  return 0
}
