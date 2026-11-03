import { childrenOf, descendants, isArranged, kindOf, MANUAL, type Tree } from './tree.ts'
import { KIND_RANK, type Task, type TaskKind } from './types.ts'

/**
 * Structural edits for the plan tree: where things go when you insert, move, promote, demote or paste.
 * Everything here returns plain changes; the caller applies them (as one undo step).
 */

export type Change = { task: Task; next: Partial<Task> }
/** Where to put something relative to a row: just before it, just after it, or inside it (last child). */
export type Place = 'before' | 'after' | 'inside'

const RANK_KIND: Record<number, TaskKind> = { 1: 'sheet', 2: 'view', 3: 'task', 4: 'item' }

/** The kind a row should become under a new parent: kept when it still fits, otherwise the next level down. */
export function kindUnder(parent: Task | null, kind: TaskKind): TaskKind {
  if (!parent) return kind === 'view' || kind === 'item' ? 'task' : kind
  const pr = KIND_RANK[kindOf(parent)]
  if (KIND_RANK[kind] > pr && kind !== 'sheet') return kind
  return RANK_KIND[Math.min(4, pr + 1)]
}

/** Items can't hold anything; dropping "inside" one means after it. */
export const canHold = (t: Task) => kindOf(t) !== 'item'

/** Is `id` the row itself or somewhere under it? (A row can't move inside itself.) */
export function isWithin(tree: Tree, root: Task, id: string) {
  return root.id === id || descendants(tree, root.id).some((d) => d.id === id)
}

/**
 * Sort orders that put `moving` rows at a spot among `parentId`'s children (in `phaseId`), renumbering
 * the whole sibling list so the hand-made order sticks.
 */
export function placeAmong(tree: Tree, parentId: string | null, phaseId: string | null, moving: Task[], anchor: Task | null, where: 'before' | 'after' | 'end'): Change[] {
  const ids = new Set(moving.map((m) => m.id))
  const siblings = childrenOf(tree, parentId).filter((t) => !ids.has(t.id) && (parentId !== null || t.phase_id === phaseId))
  let at = siblings.length
  if (anchor && where !== 'end') {
    const i = siblings.findIndex((s) => s.id === anchor.id)
    if (i >= 0) at = where === 'before' ? i : i + 1
  }
  const order = [...siblings.slice(0, at), ...moving, ...siblings.slice(at)]
  return order.map((t, i) => ({ task: t, next: { sort_order: MANUAL + i } }))
}

/** Move a row (and everything under it) to a new spot. Returns no changes when the move isn't possible. */
export function moveTo(tree: Tree, row: Task, target: Task | null, place: Place, phaseId: string | null): Change[] {
  let parent: Task | null
  let anchor: Task | null = target
  let where: 'before' | 'after' | 'end' = place === 'inside' ? 'end' : place
  if (target && place === 'inside' && canHold(target)) parent = target
  else {
    if (target && place === 'inside') where = 'after'
    parent = target?.parent_id ? tree.byId.get(target.parent_id) ?? null : null
  }
  if (!target) { parent = null; anchor = null; where = 'end' }
  if (parent && isWithin(tree, row, parent.id)) return []
  const phase = parent?.phase_id ?? target?.phase_id ?? phaseId
  const kind = kindUnder(parent, kindOf(row))
  const merged = new Map<string, Partial<Task>>()
  const add = (t: Task, next: Partial<Task>) => merged.set(t.id, { ...(merged.get(t.id) ?? {}), ...next })
  const own: Partial<Task> = { parent_id: parent?.id ?? null, phase_id: phase }
  if (kind !== kindOf(row)) own.kind = kind
  add(row, own)
  for (const c of placeAmong(tree, parent?.id ?? null, phase, [row], anchor, where)) add(c.task, c.next)
  return [...merged].map(([id, next]) => ({ task: tree.byId.get(id) ?? row, next }))
}

/** Promote: up one level, landing just after its old parent. */
export function promote(tree: Tree, row: Task): Change[] {
  const parent = row.parent_id ? tree.byId.get(row.parent_id) : undefined
  if (!parent) return []
  return moveTo(tree, row, parent, 'after', parent.phase_id)
}

/** Demote: down one level, under the row above it (as its last child). */
export function demote(tree: Tree, row: Task): Change[] {
  const siblings = childrenOf(tree, row.parent_id ?? null).filter((t) => (row.parent_id ?? null) !== null || t.phase_id === row.phase_id)
  const i = siblings.findIndex((s) => s.id === row.id)
  const above = siblings.slice(0, Math.max(0, i)).reverse().find(canHold)
  if (!above) return []
  return moveTo(tree, row, above, 'inside', row.phase_id)
}

export const canPromote = (row: Task) => Boolean(row.parent_id)
export function canDemote(tree: Tree, row: Task) {
  const siblings = childrenOf(tree, row.parent_id ?? null).filter((t) => (row.parent_id ?? null) !== null || t.phase_id === row.phase_id)
  const i = siblings.findIndex((s) => s.id === row.id)
  return siblings.slice(0, Math.max(0, i)).some(canHold)
}

/** Where a new or pasted row goes: its parent and the sort orders around it. */
export function slotFor(tree: Tree, target: Task | null, place: Place, phaseId: string | null) {
  const inside = Boolean(target && place === 'inside' && canHold(target))
  const parent = inside ? target : target?.parent_id ? tree.byId.get(target.parent_id) ?? null : null
  const phase = parent?.phase_id ?? target?.phase_id ?? phaseId
  const siblings = childrenOf(tree, parent?.id ?? null).filter((t) => parent || t.phase_id === phase)
  // Adding at the end of a list nobody arranged keeps it automatic; a spot next to a row arranges it.
  const arrange = Boolean(target && !inside) || isArranged(siblings)
  return { parent, phase, siblings, arrange, anchor: inside ? null : target, where: (inside || !target ? 'end' : place) as 'before' | 'after' | 'end' }
}

// ---------- copy / cut / paste ----------

export interface Clip { mode: 'copy' | 'cut'; rootIds: string[]; rows: Task[] }
const CLIP_KEY = 'archmgmt:clipboard'

export function saveClip(c: Clip) {
  try { localStorage.setItem(CLIP_KEY, JSON.stringify(c)) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(CLIP_KEY))
}
export function readClip(): Clip | null {
  try { const v = localStorage.getItem(CLIP_KEY); return v ? JSON.parse(v) as Clip : null } catch { return null }
}
export function clearClip() {
  try { localStorage.removeItem(CLIP_KEY) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(CLIP_KEY))
}
export const CLIP_EVENT = CLIP_KEY

/** A snapshot of rows and everything under them, for copying. */
export function branchOf(tree: Tree, roots: Task[]): Task[] {
  const seen = new Set<string>()
  const out: Task[] = []
  for (const r of roots) for (const t of [r, ...descendants(tree, r.id)]) if (!seen.has(t.id)) { seen.add(t.id); out.push(t) }
  return out
}

/**
 * New rows for pasting a copied branch: fresh ids, parents remapped, placed in the target project/phase.
 * Copies start as "to do" so a copied sheet is a fresh one to work through.
 */
export function cloneRows(rows: Task[], rootIds: string[], to: { projectId: string; phaseId: string | null; parentId: string | null; parentKind: Task | null; sortOrders: number[] }): Partial<Task>[] {
  const ids = new Map(rows.map((r) => [r.id, crypto.randomUUID()]))
  const roots = new Set(rootIds)
  let k = 0
  return rows.map((r) => {
    const root = roots.has(r.id)
    const { created_at: _c, updated_at: _u, ...rest } = r as Task & { created_at?: string; updated_at?: string }
    void _c; void _u
    return {
      ...rest,
      id: ids.get(r.id),
      project_id: to.projectId,
      phase_id: to.phaseId,
      parent_id: root ? to.parentId : ids.get(r.parent_id ?? '') ?? to.parentId,
      kind: root ? kindUnder(to.parentKind, kindOf(r)) : kindOf(r),
      status: 'todo',
      sort_order: root ? to.sortOrders[k++] ?? r.sort_order : r.sort_order,
    }
  })
}
