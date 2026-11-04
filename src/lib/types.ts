export type PersonKind = 'staff' | 'consultant'

export interface Person {
  id: string
  name: string
  initials: string | null
  role: string | null
  /** Used for their archMGMT sign-in. */
  email?: string | null
  kind: PersonKind
  company: string | null
  discipline: string | null
  /** Kept from earlier versions; not shown. Workload uses `availability`. */
  weekly_hours: number
  /** Share of a full-time load this person can carry, in percent (100 = full time). */
  availability?: number | null
  color: string | null
  active: boolean
}

export type ProjectStatus = 'pursuit' | 'active' | 'on_hold' | 'complete'

export interface Project {
  id: string
  number: string | null
  name: string
  client: string | null
  status: ProjectStatus
  pm_id: string | null
  color: string | null
  /** How phase colours are built from `color`: balanced | triad | complementary. */
  color_scheme?: string | null
  /** Presentation view rules (see presentation.ts). */
  presentation?: unknown
  start_date: string | null
  end_date: string | null
  notes: string | null
  /** Construction budget in dollars. */
  budget?: number | null
  /** Gross area in square feet. */
  gross_area?: number | null
  /** Education, office, healthcare… (see BUILDING_TYPES). */
  building_type?: string | null
  /** Set when archived: hidden from lists and workload, data kept, can be restored. */
  archived_at?: string | null
  created_at?: string
}

export interface Phase {
  id: string
  project_id: string
  name: string
  sort_order: number
  start_date: string
  end_date: string
  client_visible: boolean
}

export type TaskKind = 'sheet' | 'view' | 'task' | 'item'

export const KIND_RANK: Record<TaskKind, number> = { sheet: 1, view: 2, task: 3, item: 4 }

export type Effort = 1 | 2 | 3

export const EFFORTS: { value: Effort; label: string; hint: string }[] = [
  { value: 1, label: 'Light', hint: 'Background or occasional work' },
  { value: 2, label: 'Medium', hint: 'A normal share of the week' },
  { value: 3, label: 'Heavy', hint: 'Takes most of the week while it runs' },
]

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'

export interface Task {
  id: string
  project_id: string
  phase_id: string | null
  title: string
  /** Lead person (the first of assignee_ids); kept for older code and backups. */
  assignee_id: string | null
  /** Everyone on it. Older rows may only have assignee_id: read through assigneesOf(). */
  assignee_ids?: string[]
  /** Milestones only: owner | internal | coordination | agency | contract (see milestones.ts). */
  milestone_type?: string | null
  start_date: string | null
  due_date: string | null
  /** Kept from earlier versions; not shown (hours live in Monograph). */
  estimated_hours: number | null
  /** Task size for workload: 1 light, 2 medium, 3 heavy. */
  effort?: Effort | null
  /** Hierarchy: the sheet, view or task this sits under (null = directly in the phase). */
  parent_id?: string | null
  /** sheet → view → task → item. Items are checklist lines / info and are never scheduled. */
  kind?: TaskKind | null
  /** Sheets: number (A101) and type (key into SHEET_TYPES). */
  sheet_number?: string | null
  sheet_type?: string | null
  /** Extra info for anything in the tree. */
  notes?: string | null
  status: TaskStatus
  is_milestone: boolean
  client_visible: boolean
  sort_order: number
}

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'pursuit', label: 'Pursuit' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'complete', label: 'Complete' },
]

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'review', label: 'In review' },
  { value: 'done', label: 'Done' },
]

/** Standard phases a new project starts with, and a typical length for each. */
export const DEFAULT_PHASES: { name: string; weeks: number }[] = [
  { name: 'Predesign', weeks: 4 },
  { name: 'Schematic Design', weeks: 6 },
  { name: 'Design Development', weeks: 8 },
  { name: 'Construction Documents', weeks: 12 },
  { name: 'Bidding', weeks: 4 },
  { name: 'Construction Administration', weeks: 40 },
]

export type TableName = 'people' | 'projects' | 'phases' | 'tasks' | 'time_off' | 'meeting_notes'

/** Tables in the order they can be restored (parents before children). */
export const TABLES: TableName[] = ['people', 'projects', 'phases', 'tasks', 'time_off', 'meeting_notes']

/** Notes from a meeting, kept with the project; optionally tied to a milestone or task. */
export interface MeetingNote {
  id: string
  project_id: string
  task_id: string | null
  meeting_date: string
  title: string
  attendees: string | null
  body: string | null
  author: string | null
  created_at?: string
  updated_at?: string
}

export interface TimeOff {
  id: string
  person_id: string
  start_date: string
  end_date: string
  note: string | null
}
