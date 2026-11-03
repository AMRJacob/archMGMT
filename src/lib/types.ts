export type PersonKind = 'staff' | 'consultant'

export interface Person {
  id: string
  name: string
  initials: string | null
  role: string | null
  kind: PersonKind
  company: string | null
  discipline: string | null
  weekly_hours: number
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
  start_date: string | null
  end_date: string | null
  notes: string | null
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

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'

export interface Task {
  id: string
  project_id: string
  phase_id: string | null
  title: string
  assignee_id: string | null
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
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

export type TableName = 'people' | 'projects' | 'phases' | 'tasks' | 'time_off'

/** Tables in the order they can be restored (parents before children). */
export const TABLES: TableName[] = ['people', 'projects', 'phases', 'tasks', 'time_off']

export interface TimeOff {
  id: string
  person_id: string
  start_date: string
  end_date: string
  note: string | null
}
