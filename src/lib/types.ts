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
  /** The people on this project (Overview → Team). Assigning tasks offers these first. */
  team?: string[] | null
  /** Custom presentation colours (Schedule → Presentation view → Custom). */
  export_colors?: BrandRoles | null
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
  /** Its place in the project's colour palette; stays put when phases are reordered. */
  color_slot?: number | null
}

/** 'section' is a Project Manual spec section (e.g. 08 71 00 Door Hardware); it holds tasks and items like a sheet. */
export type TaskKind = 'sheet' | 'section' | 'task' | 'item'

export const KIND_RANK: Record<TaskKind, number> = { sheet: 1, section: 1, task: 2, item: 3 }

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
  /** sheet / spec section → task → item ('subtask'). Subtasks are tick-box lines and are never scheduled. */
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

export type TableName = 'people' | 'projects' | 'phases' | 'tasks' | 'time_off' | 'meeting_notes' | 'brand_palettes' | 'wishlist'

/** Tables in the order they can be restored (parents before children). */
export const TABLES: TableName[] = ['people', 'projects', 'phases', 'tasks', 'time_off', 'meeting_notes', 'brand_palettes']
// The wishlist isn't project data, so it's not in backups.

/** Notes from a meeting, kept with the project; optionally tied to a milestone or task. */
export interface MeetingNote {
  id: string
  project_id: string
  task_id: string | null
  meeting_date: string
  title: string
  /** Guests who aren't on the Team list (owner reps, contractors…), comma separated. */
  attendees: string | null
  /** People from the Team list who were there. */
  attendee_ids?: string[]
  meeting_type?: string | null
  location?: string | null
  body: string | null
  decisions?: string | null
  actions?: ActionItem[]
  author: string | null
  created_at?: string
  updated_at?: string
}

/** An action item from a meeting; can be turned into a task in the project. */
export interface ActionItem {
  id: string
  text: string
  who: string | null
  due: string | null
  done: boolean
  task_id?: string | null
}

export const MEETING_TYPES: { value: string; label: string; color: string }[] = [
  { value: 'owner', label: 'Owner meeting', color: '#d9480f' },
  { value: 'coordination', label: 'Consultant coordination', color: '#1c7ed6' },
  { value: 'internal', label: 'Internal', color: '#495057' },
  { value: 'site', label: 'Site visit', color: '#2b8a3e' },
  { value: 'agency', label: 'Agency / permit', color: '#7048e8' },
  { value: 'other', label: 'Other', color: '#868e96' },
]

/** A saved set of brand colours (a campus or company standard) that a project's phases can use. */
export interface BrandPalette {
  id: string
  name: string
  /** Phase colours, in order: the first is the project's main colour. */
  colors: string[]
  notes: string | null
  /** Which colour paints which part of a presented / printed schedule. Missing = automatic. */
  roles?: BrandRoles | null
}
export interface BrandRoles { background?: string; band?: string; accent?: string; text?: string }
export const BRAND_ROLES: { key: keyof BrandRoles; label: string; hint: string }[] = [
  { key: 'background', label: 'Background', hint: 'The page behind the schedule' },
  { key: 'band', label: 'Cells', hint: 'Phase rows and the bands behind them' },
  { key: 'accent', label: 'Headings & accent', hint: 'Firm name, today marker, highlights' },
  { key: 'text', label: 'Text', hint: 'Titles, labels and dates' },
]

export type WishStatus = 'new' | 'under_review' | 'approved' | 'planned' | 'in_progress' | 'complete' | 'infeasible' | 'duplicate'
export const WISH_STATUSES: { value: WishStatus; label: string; closed: boolean }[] = [
  { value: 'new', label: 'New', closed: false },
  { value: 'under_review', label: 'Under review', closed: false },
  { value: 'approved', label: 'Approved – ready to build', closed: false },
  { value: 'planned', label: 'Planned', closed: false },
  { value: 'in_progress', label: 'In progress', closed: false },
  { value: 'complete', label: 'Complete – closed', closed: true },
  { value: 'infeasible', label: 'Infeasible – closed', closed: true },
  { value: 'duplicate', label: 'Duplicate – closed', closed: true },
]

/** Wishlist priorities, green to red. */
export const WISH_PRIORITIES: { value: number; label: string; color: string }[] = [
  { value: 1, label: 'Low', color: '#3f9a5b' },
  { value: 2, label: 'Normal', color: '#a3a838' },
  { value: 3, label: 'High', color: '#df8a2c' },
  { value: 4, label: 'Urgent', color: '#d2453b' },
]

/** A wish or error report from Settings → Wishlist & Errors. (Errors are stored with kind 'problem'.) */
export interface WishItem {
  id: string
  kind: 'wish' | 'problem'
  title: string
  details: string | null
  status: WishStatus
  response: string | null
  submitted_by: string | null
  sort_order: number
  /** 1 low · 2 normal · 3 high · 4 urgent (null: not set). */
  priority?: number | null
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
