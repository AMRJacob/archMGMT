import type { MilestoneType } from './milestones.ts'
import type { Project, Task } from './types.ts'

/**
 * What the presentation view shows. Rules pick whole groups (milestones, sheets, top-level tasks);
 * single items can be added (tasks.client_visible) or hidden (hidden ids) on top of the rules.
 */
export interface PresentationRules {
  /** 'all' milestones, 'none', or only these types. */
  milestones: 'all' | 'none' | MilestoneType[]
  sheets: boolean
  /** Tasks directly in a phase (not under a sheet or view). */
  tasks: boolean
  /** Shown by the rules but hidden by hand. */
  hidden: string[]
}

export const DEFAULT_RULES: PresentationRules = { milestones: 'all', sheets: false, tasks: false, hidden: [] }

export function rulesOf(p: Pick<Project, 'presentation'> | null | undefined): PresentationRules {
  const r = (p?.presentation ?? {}) as Partial<PresentationRules>
  return { ...DEFAULT_RULES, ...r, hidden: Array.isArray(r.hidden) ? r.hidden : [] }
}

/** Would the rules alone show this? */
export function ruleMatch(r: PresentationRules, t: Task): boolean {
  if (t.kind === 'item') return false
  if (t.is_milestone) return r.milestones === 'all' || (Array.isArray(r.milestones) && r.milestones.includes(t.milestone_type as MilestoneType))
  if (t.kind === 'sheet') return r.sheets
  if (!t.parent_id && (t.kind ?? 'task') === 'task') return r.tasks
  return false
}

export function isPresented(r: PresentationRules, t: Task): boolean {
  if (r.hidden.includes(t.id)) return false
  return t.client_visible || ruleMatch(r, t)
}

/** The changes that flip one item in or out of the presentation view. */
export function togglePresented(r: PresentationRules, t: Task): { task?: Partial<Task>; rules?: PresentationRules } {
  if (isPresented(r, t)) {
    const out: { task?: Partial<Task>; rules?: PresentationRules } = {}
    if (t.client_visible) out.task = { client_visible: false }
    if (ruleMatch(r, t)) out.rules = { ...r, hidden: [...r.hidden, t.id] }
    return out
  }
  const out: { task?: Partial<Task>; rules?: PresentationRules } = {}
  if (r.hidden.includes(t.id)) out.rules = { ...r, hidden: r.hidden.filter((x) => x !== t.id) }
  if (!ruleMatch(r, t) && !t.client_visible) out.task = { client_visible: true }
  return out
}
