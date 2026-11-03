import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.ts'
import { addDays, nextMonday } from './dates.ts'
import { DEFAULT_PHASES } from './types.ts'

/**
 * One small data layer for every screen.
 * With Supabase keys set it reads and writes the shared database; without them it uses
 * sample data saved in this browser, so the app can be tried before the database exists.
 */

export type TableName = 'people' | 'projects' | 'phases' | 'tasks' | 'time_off'
type Row = { id: string } & Record<string, unknown>
type Match = Record<string, string | number | boolean | null>

export const usingSampleData = !supabase

// ---------- browser (sample data) store ----------

const KEY = 'archmgmt:sample-data:v1'
type Store = Record<TableName, Row[]>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Store
  } catch {
    /* storage unavailable: fall through to fresh sample data */
  }
  const fresh = sampleData()
  writeStore(fresh)
  return fresh
}

function writeStore(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: changes last until the page reloads */
  }
}

export function resetSampleData() {
  writeStore(sampleData())
}

/** Mirrors the database's foreign-key rules (cascade / set null) for the browser store. */
const onDelete: Record<TableName, { table: TableName; column: string; action: 'cascade' | 'null' }[]> = {
  people: [
    { table: 'tasks', column: 'assignee_id', action: 'null' },
    { table: 'projects', column: 'pm_id', action: 'null' },
    { table: 'time_off', column: 'person_id', action: 'cascade' },
  ],
  projects: [
    { table: 'phases', column: 'project_id', action: 'cascade' },
    { table: 'tasks', column: 'project_id', action: 'cascade' },
  ],
  phases: [{ table: 'tasks', column: 'phase_id', action: 'null' }],
  tasks: [],
  time_off: [],
}

function deleteLocal(s: Store, table: TableName, id: string) {
  s[table] = s[table].filter((r) => r.id !== id)
  for (const rule of onDelete[table]) {
    if (rule.action === 'null') {
      s[rule.table] = s[rule.table].map((r) => (r[rule.column] === id ? { ...r, [rule.column]: null } : r))
    } else {
      for (const r of s[rule.table].filter((r) => r[rule.column] === id)) deleteLocal(s, rule.table, r.id)
    }
  }
}

// ---------- public API ----------

export async function list<T>(table: TableName, match: Match = {}): Promise<T[]> {
  if (supabase) {
    let q = supabase.from(table).select('*')
    for (const [k, v] of Object.entries(match)) q = v === null ? q.is(k, null) : q.eq(k, v)
    const { data, error } = await q
    if (error) throw error
    return data as T[]
  }
  const rows = readStore()[table] ?? []
  return rows.filter((r) => Object.entries(match).every(([k, v]) => r[k] === v)) as unknown as T[]
}

export async function insert<T>(table: TableName, row: Partial<T>): Promise<T> {
  if (supabase) {
    const { data, error } = await supabase.from(table).insert(row as never).select().single()
    if (error) throw error
    return data as T
  }
  const s = readStore()
  const created = { id: crypto.randomUUID(), ...row } as unknown as Row
  s[table] = [...(s[table] ?? []), created]
  writeStore(s)
  return created as unknown as T
}

export async function insertMany<T>(table: TableName, rows: Partial<T>[]): Promise<T[]> {
  if (supabase) {
    const { data, error } = await supabase.from(table).insert(rows as never).select()
    if (error) throw error
    return data as T[]
  }
  const s = readStore()
  const created = rows.map((r) => ({ id: crypto.randomUUID(), ...r }) as unknown as Row)
  s[table] = [...(s[table] ?? []), ...created]
  writeStore(s)
  return created as unknown as T[]
}

export async function update<T>(table: TableName, id: string, patch: Partial<T>): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from(table).update(patch as never).eq('id', id)
    if (error) throw error
    return
  }
  const s = readStore()
  s[table] = s[table].map((r) => (r.id === id ? { ...r, ...patch } : r))
  writeStore(s)
}

export async function remove(table: TableName, id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return
  }
  const s = readStore()
  deleteLocal(s, table, id)
  writeStore(s)
}

/** Load rows for a screen, with helpers to keep the on-screen copy in step with edits. */
export function useRows<T extends { id: string }>(table: TableName, match: Match = {}) {
  const key = JSON.stringify(match)
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setRows(await list<T>(table, JSON.parse(key) as Match))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [table, key])

  // Loading from the database (or browser store) is syncing with an external system.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void reload()
  }, [reload])

  /** Update one row on screen immediately, then save it. */
  const patch = useCallback(
    async (id: string, changes: Partial<T>) => {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)))
      try {
        await update<T>(table, id, changes)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        void reload()
      }
    },
    [table, reload],
  )

  const add = useCallback(
    async (row: Partial<T>) => {
      const created = await insert<T>(table, row)
      setRows((rs) => [...rs, created])
      return created
    },
    [table],
  )

  const drop = useCallback(
    async (id: string) => {
      setRows((rs) => rs.filter((r) => r.id !== id))
      await remove(table, id)
    },
    [table],
  )

  return { rows, loading, error, reload, patch, add, drop }
}

/** Build a project's standard phases back to back from a start date. */
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

// ---------- sample data (clearly placeholder; replaced by the real database) ----------

function sampleData(): Store {
  const id = () => crypto.randomUUID()
  const people: Row[] = [
    ['Sample Principal', 'SP', 'Principal', 40],
    ['Sample Project Architect', 'PA', 'Project Architect', 40],
    ['Sample Architect', 'SA', 'Architect', 40],
    ['Sample Designer', 'SD', 'Designer', 40],
    ['Sample Intern', 'SI', 'Intern', 20],
  ].map(([name, initials, role, hours]) => ({
    id: id(), name, initials, role, kind: 'staff', company: null, discipline: null,
    weekly_hours: hours, color: null, active: true,
  }))
  people.push({
    id: id(), name: 'Sample MEP Engineer', initials: 'ME', role: null, kind: 'consultant',
    company: 'Sample MEP Consultants', discipline: 'MEP', weekly_hours: 0, color: null, active: true,
  })

  const start = addDays(nextMonday(), -7 * 10)
  const project: Row = {
    id: id(), number: '2026-001', name: 'Sample Library Renovation', client: 'Sample Client',
    status: 'active', pm_id: people[1].id, color: null, start_date: null, end_date: null,
    notes: 'Sample project. Edit or delete it freely.', created_at: new Date().toISOString(),
  }
  const phases = defaultPhaseRows(project.id, start).map((p) => ({ id: id(), ...p }) as Row)
  const [pre, sd, dd] = phases
  const t = (phase: Row, title: string, who: number, startOff: number, len: number, hours: number | null, extra: Partial<Row> = {}): Row => ({
    id: id(), project_id: project.id, phase_id: phase.id, title, assignee_id: people[who].id,
    start_date: addDays(phase.start_date as string, startOff), due_date: addDays(phase.start_date as string, startOff + len),
    estimated_hours: hours, status: 'todo', is_milestone: false, client_visible: false, sort_order: 0, ...extra,
  })
  const tasks: Row[] = [
    t(pre, 'Existing conditions survey', 2, 0, 9, 24, { status: 'done' }),
    t(pre, 'Program verification with owner', 1, 7, 14, 16, { status: 'done' }),
    t(sd, 'Floor plan options', 3, 0, 20, 60, { status: 'done' }),
    t(sd, 'Owner SD review', 1, 41, 0, null, { is_milestone: true, client_visible: true, status: 'done' }),
    t(dd, 'Enlarged plans and sections', 2, 0, 35, 80, { status: 'in_progress' }),
    t(dd, 'MEP coordination set', 5, 14, 28, null, { status: 'in_progress' }),
    t(dd, 'Outline specifications', 4, 21, 21, 30),
    t(dd, 'Owner DD review', 1, 55, 0, null, { is_milestone: true, client_visible: true }),
  ]
  return { people, projects: [project], phases, tasks, time_off: [] }
}
