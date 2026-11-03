import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.ts'
import { seedV1, seedV2, type Row, type Store } from './sample.ts'
import { TABLES, type TableName } from './types.ts'

/**
 * One small data layer for every screen.
 * With Supabase keys set it reads and writes the shared database; without them it uses
 * data saved in this browser (starting with tagged sample data), so the app can be tried first.
 */

export type { TableName }
type Match = Record<string, string | number | boolean | null>

export const usingSampleData = !supabase

// ---------- browser store ----------
//
// Data here must survive every update to the app. Rules:
//  - The storage key never changes (a new key would strand existing data).
//  - When the shape of the data changes, add a step to UPGRADES below. Steps only add or
//    convert; they never wipe. They run once, in order, and the version is recorded.
//  - Sample rows are tagged so "Remove sample data" deletes only those.

const KEY = 'archmgmt:sample-data:v1' // historical name: this holds all browser data, sample or not
const META_KEY = 'archmgmt:meta'
interface Meta { version: number; sampleIds: string[] }

const emptyStore = (): Store => ({ people: [], projects: [], phases: [], tasks: [], time_off: [] })

const UPGRADES: ((s: Store, meta: Meta) => void)[] = [
  // 0 → 1: first visit, add the original sample project
  (s, meta) => seedV1(s, (id) => meta.sampleIds.push(id)),
  // 1 → 2: tag sample rows from before tagging existed, then add the full sample office
  (s, meta) => {
    const tagged = new Set(meta.sampleIds)
    const tag = (id: string) => { if (!tagged.has(id)) { tagged.add(id); meta.sampleIds.push(id) } }
    const lib = s.projects.find((p) => p.name === 'Sample Library Renovation')
    if (lib) {
      tag(lib.id)
      s.phases.filter((p) => p.project_id === lib.id).forEach((p) => tag(p.id))
      s.tasks.filter((t) => t.project_id === lib.id).forEach((t) => tag(t.id))
    }
    s.people.filter((p) => String(p.name).startsWith('Sample ')).forEach((p) => tag(p.id))
    for (const p of s.people) p.kind ??= 'staff'
    seedV2(s, tag)
  },
  // 2 → 3: give sample projects their own colour scheme (only sample projects with no colour yet)
  (s, meta) => {
    const sample = new Set(meta.sampleIds)
    const roots: Record<string, string> = {
      'Sample Library Renovation': '#557a99', 'Sample Fire Station No. 3': '#b8694a', 'Sample Clinic Addition': '#4d8a86',
      'Sample Office Fit-out': '#8a77a8', 'Sample Campus Master Plan': '#6b8f71',
    }
    for (const p of s.projects) if (sample.has(p.id) && !p.color && roots[String(p.name)]) p.color = roots[String(p.name)]
  },
  // 3 → 4: workload moves from hours to sizes. Hour estimates are KEPT; they only set a starting size.
  (s) => {
    for (const t of s.tasks) {
      if (t.effort != null) continue
      const h = typeof t.estimated_hours === 'number' ? t.estimated_hours : null
      const a = (t.start_date ?? t.due_date) as string | null, b = (t.due_date ?? t.start_date) as string | null
      const weeks = a && b ? Math.max(1, (Date.parse(b) - Date.parse(a)) / (7 * 86400000)) : 1
      const perWeek = h === null ? null : h / weeks
      t.effort = perWeek === null ? 2 : perWeek <= 8 ? 1 : perWeek <= 20 ? 2 : 3
    }
    for (const p of s.people) {
      if (p.availability != null) continue
      const wh = typeof p.weekly_hours === 'number' ? p.weekly_hours : 40
      p.availability = p.kind === 'consultant' ? 100 : Math.max(10, Math.min(100, Math.round((wh / 40) * 10) * 10))
    }
  },
]

// Read fresh every time (no cache), so two open tabs never overwrite each other's changes.
function readStore(): Store {
  let store: Store | null = null
  let meta: Meta | null = null
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) store = { ...emptyStore(), ...(JSON.parse(raw) as Partial<Store>) }
    const m = localStorage.getItem(META_KEY)
    if (m) meta = JSON.parse(m) as Meta
  } catch {
    /* storage unavailable: work in memory */
  }
  if (!store) { store = emptyStore(); meta = { version: 0, sampleIds: [] } }
  if (!meta) meta = { version: 1, sampleIds: [] } // data saved before versions were recorded
  if (meta.version < UPGRADES.length) {
    for (let v = meta.version; v < UPGRADES.length; v++) UPGRADES[v](store, meta)
    meta.version = UPGRADES.length
    writeStore(store) // data first, so a failed write never marks the upgrade as done
    writeMeta(meta)
  }
  return store
}

function readMeta(): Meta {
  readStore()
  try {
    const m = localStorage.getItem(META_KEY)
    if (m) return JSON.parse(m) as Meta
  } catch { /* fall through */ }
  return { version: UPGRADES.length, sampleIds: [] }
}

function writeMeta(m: Meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(m)) } catch { /* in memory only */ }
}

function writeStore(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: changes last until the page reloads */
  }
}

/** How many sample rows are still in the browser store. */
export function sampleRowCount(): number {
  if (supabase) return 0
  const ids = new Set(readMeta().sampleIds)
  const s = readStore()
  return TABLES.reduce((n, t) => n + s[t].filter((r) => ids.has(r.id)).length, 0)
}

/** Delete only the tagged sample rows; anything you added stays. */
export function removeSampleData() {
  const meta = readMeta()
  const s = readStore()
  for (const t of TABLES) for (const id of meta.sampleIds) if (s[t].some((r) => r.id === id)) deleteLocal(s, t, id)
  writeStore(s)
  writeMeta({ ...meta, sampleIds: [] })
}

// ---------- backup / restore ----------

export interface Backup {
  format: 'archmgmt-backup'
  exported_at: string
  tables: Store
}

export async function exportAll(): Promise<Backup> {
  const tables = emptyStore()
  for (const t of TABLES) tables[t] = await list<Row>(t)
  return { format: 'archmgmt-backup', exported_at: new Date().toISOString(), tables }
}

/**
 * Restore a backup. Rows are matched by id: existing rows are updated, missing ones added.
 * Nothing that isn't in the backup is deleted.
 */
export async function importAll(b: Backup): Promise<number> {
  if (b?.format !== 'archmgmt-backup') throw new Error('This file is not an archMGMT backup.')
  let n = 0
  if (supabase) {
    for (const t of TABLES) {
      const rows = b.tables[t] ?? []
      if (!rows.length) continue
      const { error } = await supabase.from(t).upsert(rows as never)
      if (error) throw error
      n += rows.length
    }
    return n
  }
  const s = readStore()
  for (const t of TABLES) {
    for (const row of b.tables[t] ?? []) {
      const i = s[t].findIndex((r) => r.id === row.id)
      if (i >= 0) s[t][i] = row
      else s[t].push(row)
      n++
    }
  }
  writeStore(s)
  return n
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
