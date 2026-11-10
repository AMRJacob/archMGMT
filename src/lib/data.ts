import { useCallback, useEffect, useRef, useState } from 'react'
import { markMine, me, nameOf, noteRemote, notify, wasMine } from './live.ts'
import { supabase } from './supabase.ts'
import { seedSheets, seedV1, seedV2, type Row, type Store } from './sample.ts'
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

const emptyStore = (): Store => ({ people: [], projects: [], phases: [], tasks: [], time_off: [], meeting_notes: [], brand_palettes: [], wishlist: [] })

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
  // 4 → 5: hierarchy (sheet → view → task → item). Existing tasks become top-level tasks;
  // the sample library project gets a few example sheets.
  (s, meta) => {
    for (const t of s.tasks) { t.kind ??= 'task'; t.parent_id ??= null }
    seedSheets(s, (id) => meta.sampleIds.push(id))
  },
  // 5 → 6: several people per task. assignee_ids lists everyone; assignee_id stays as the lead.
  (s) => {
    for (const t of s.tasks) {
      if (Array.isArray(t.assignee_ids) && t.assignee_ids.length) continue
      t.assignee_ids = t.assignee_id ? [t.assignee_id] : []
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
    { table: 'meeting_notes', column: 'project_id', action: 'cascade' },
  ],
  phases: [{ table: 'tasks', column: 'phase_id', action: 'null' }],
  tasks: [
    { table: 'tasks', column: 'parent_id', action: 'cascade' },
    { table: 'meeting_notes', column: 'task_id', action: 'null' },
  ],
  time_off: [],
  meeting_notes: [],
  brand_palettes: [],
  wishlist: [],
}

function deleteLocal(s: Store, table: TableName, id: string) {
  s[table] = s[table].filter((r) => r.id !== id)
  for (const rule of onDelete[table]) {
    if (table === 'people' && rule.column === 'assignee_id') {
      // Mirrors the database trigger: take the person off every task, and the lead becomes the next person.
      s.tasks = s.tasks.map((r) => {
        const ids = Array.isArray(r.assignee_ids) ? (r.assignee_ids as string[]).filter((x) => x !== id) : r.assignee_ids
        const touched = r.assignee_id === id || (Array.isArray(r.assignee_ids) && (r.assignee_ids as string[]).includes(id))
        return touched ? { ...r, assignee_ids: ids, assignee_id: Array.isArray(ids) ? (ids[0] ?? null) : null } : r
      })
      continue
    }
    if (rule.action === 'null') {
      s[rule.table] = s[rule.table].map((r) => (r[rule.column] === id ? { ...r, [rule.column]: null } : r))
    } else {
      for (const r of s[rule.table].filter((r) => r[rule.column] === id)) deleteLocal(s, rule.table, r.id)
    }
  }
}

// ---------- public API ----------

export async function list<T>(table: TableName, match: Match = {}): Promise<T[]> {
  if (Object.values(match).some((v) => v === '')) return [] // e.g. no project chosen yet
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
    const withId = { id: crypto.randomUUID(), ...row }
    markMine(withId.id)
    const { data, error } = await supabase.from(table).insert(withId as never).select().single()
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
    // Rows in one batch can have different fields (a task and its checklist items). Give every row an id
    // up front and let columns a row leaves out take their database default instead of NULL; otherwise
    // the whole batch fails (e.g. a NULL id or assignee list).
    const withIds = rows.map((r) => ({ id: crypto.randomUUID(), ...r }))
    for (const r of withIds) markMine(r.id)
    const { data, error } = await supabase.from(table).insert(withIds as never, { defaultToNull: false }).select()
    if (error) throw error
    return data as T[]
  }
  const s = readStore()
  const created = rows.map((r) => ({ id: crypto.randomUUID(), ...r }) as unknown as Row)
  s[table] = [...(s[table] ?? []), ...created]
  writeStore(s)
  return created as unknown as T[]
}

/** Tables that record when and by whom each row last changed (migration 0020): saves to these are checked. */
const GUARDED = new Set<TableName>(['projects', 'phases', 'tasks', 'people', 'meeting_notes'])

/** Someone else saved this row after we loaded it; our change was not written. */
export class StaleError extends Error {
  by: string | null
  constructor(by: string | null) { super('changed by someone else'); this.by = by }
}

/**
 * Save changes to one row. With `seen` (the row's updated_at when we loaded it), the save only goes through
 * if nobody else has changed the row since; otherwise it throws StaleError. Returns the row's new updated_at.
 */
export async function update<T>(table: TableName, id: string, patch: Partial<T>, seen?: string): Promise<string | undefined> {
  if (supabase) {
    markMine(id)
    if (!seen) {
      const { error } = await supabase.from(table).update(patch as never).eq('id', id)
      if (error) throw error
      return
    }
    let expect = seen
    for (let i = 0; i < 4; i++) {
      const { data, error } = await supabase.from(table).update(patch as never).eq('id', id).eq('updated_at', expect).select('updated_at')
      if (error) throw error
      const row = (data as { updated_at: string }[])[0]
      if (row) return row.updated_at
      // Not saved: see who changed it. Our own earlier save (two quick edits) is fine: try again on top of it.
      const cur = await supabase.from(table).select('updated_at, updated_by').eq('id', id).maybeSingle()
      if (cur.error) throw cur.error
      if (!cur.data) return // deleted meanwhile
      const c = cur.data as { updated_at: string; updated_by: string | null }
      if (c.updated_by !== me()) throw new StaleError(c.updated_by)
      expect = c.updated_at
    }
    throw new StaleError(null)
  }
  const s = readStore()
  s[table] = s[table].map((r) => (r.id === id ? { ...r, ...patch } : r))
  writeStore(s)
}

export async function remove(table: TableName, id: string): Promise<void> {
  if (supabase) {
    markMine(id)
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return
  }
  const s = readStore()
  deleteLocal(s, table, id)
  writeStore(s)
}

/** Delete several rows at once (children go with them where the database cascades). */
export async function removeMany(table: TableName, ids: string[]): Promise<void> {
  if (!ids.length) return
  if (supabase) {
    for (const id of ids) markMine(id)
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from(table).delete().in('id', ids.slice(i, i + 200))
      if (error) throw error
    }
    return
  }
  const s = readStore()
  for (const id of ids) deleteLocal(s, table, id)
  writeStore(s)
}

/** Fields a sheet shares with its copies in other phases (see sheet_link). */
const LINKED_FIELDS = ['sheet_number', 'title', 'sheet_type'] as const

/** Load rows for a screen, with helpers to keep the on-screen copy in step with edits. */
export function useRows<T extends { id: string }>(table: TableName, match: Match = {}) {
  const key = JSON.stringify(match)
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const rowsRef = useRef(rows)
  useEffect(() => { rowsRef.current = rows }, [rows])

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

  // Shared database: other people's changes come in live, with a short notice.
  useEffect(() => {
    if (!supabase) return
    const m = JSON.parse(key) as Match
    if (Object.values(m).some((v) => v === '')) return
    const keys = Object.keys(m)
    // Realtime filters take one column; anything else is checked here.
    const filter = keys.length ? `${keys[0]}=eq.${String(m[keys[0]])}` : undefined
    const wait: { t?: ReturnType<typeof setTimeout> } = {}
    const later = () => { clearTimeout(wait.t); wait.t = setTimeout(() => void reload(), 400) }
    const changed = (row: Record<string, unknown>, verb: 'added' | 'changed') => {
      if (!keys.every((k) => row[k] === m[k])) return
      const by = (row.updated_by as string | null | undefined) ?? null
      if (by === me() || wasMine(String(row.id ?? ''))) return
      noteRemote(table, by, String(row.id ?? ''), verb)
      later()
    }
    const channel = supabase
      .channel(`rows:${table}:${key}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, ...(filter ? { filter } : {}) }, (payload) => changed(payload.new as Record<string, unknown>, 'added'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, ...(filter ? { filter } : {}) }, (payload) => changed(payload.new as Record<string, unknown>, 'changed'))
      // Deletes can't be filtered and only carry the id: act on the ones that were on screen.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, (payload) => {
        const id = String((payload.old as { id?: string }).id ?? '')
        if (!rowsRef.current.some((r) => r.id === id) || wasMine(id)) return
        noteRemote(table, null, id, 'removed')
        later()
      })
      .subscribe()
    return () => { clearTimeout(wait.t); void supabase!.removeChannel(channel) }
  }, [table, key, reload])

  // Saves to the same row go one after another: each starts from the version the last one produced, so two
  // quick edits (e.g. a colour and its scheme) can't trip the "someone else changed this" check on each other.
  const queue = useRef(new Map<string, Promise<void>>())
  const savedAt = useRef(new Map<string, string>())

  /** Update one row on screen immediately, then save it (unless someone else changed it first). */
  const patchOne = useCallback(
    (id: string, changes: Partial<T>) => {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)))
      const job = (queue.current.get(id) ?? Promise.resolve()).then(async () => {
        // The newest version we know of: our own last save, or what's on screen (which may have been reloaded since).
        const onScreen = (rowsRef.current.find((r) => r.id === id) as { updated_at?: string } | undefined)?.updated_at
        const mine = savedAt.current.get(id)
        const seen = GUARDED.has(table) ? ([mine, onScreen].filter(Boolean).sort().pop() as string | undefined) : undefined
        try {
          const at = await update<T>(table, id, changes, seen)
          if (at) { savedAt.current.set(id, at); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, updated_at: at } : r))) }
        } catch (e) {
          savedAt.current.delete(id)
          if (e instanceof StaleError) notify(`${nameOf(e.by)} changed this just before you, so your edit wasn't saved. You're now seeing their version.`, 'warn')
          else {
            // A refused save must not pass silently: say so, then show what's actually stored.
            const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
            setError(msg)
            notify(`That change couldn't be saved, so it was undone (${msg}).`, 'warn')
          }
          void reload()
        }
      })
      queue.current.set(id, job)
      return job
    },
    [table, reload],
  )

  const patch = useCallback(
    (id: string, changes: Partial<T>): Promise<void> => {
      // A sheet carried through phases: renaming, renumbering or retyping one copy changes them all.
      if (table === 'tasks') {
        const row = rowsRef.current.find((r) => r.id === id) as { sheet_link?: string | null } | undefined
        const shared = Object.fromEntries(Object.entries(changes).filter(([k]) => (LINKED_FIELDS as readonly string[]).includes(k)))
        if (row?.sheet_link && Object.keys(shared).length && !('sheet_link' in changes)) {
          for (const other of rowsRef.current) {
            const o = other as unknown as { id: string; sheet_link?: string | null }
            if (o.id !== id && o.sheet_link === row.sheet_link) void patchOne(o.id, shared as Partial<T>)
          }
        }
      }
      return patchOne(id, changes)
    },
    [table, patchOne],
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
