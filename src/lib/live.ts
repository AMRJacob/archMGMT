import { createContext, useContext, useSyncExternalStore } from 'react'
import { supabase } from './supabase.ts'

/**
 * Working together: who I am, short notices ("Susan moved 3 tasks"), and who's editing what.
 * Only with the shared database; browser-only mode has a single user.
 */

// ---------- me ----------
let myId: string | null = null
if (supabase) {
  void supabase.auth.getSession().then(({ data }) => { myId = data.session?.user.id ?? null })
  supabase.auth.onAuthStateChange((_e, s) => { myId = s?.user.id ?? null })
}
export const me = () => myId

// ---------- names (filled from presence: whoever changed something is almost always online) ----------
const names = new Map<string, string>()
export const rememberName = (id: string, name: string) => names.set(id, name)
export const nameOf = (id: string | null | undefined) => (id && names.get(id)) || 'Someone'

// ---------- notices ----------
export interface Notice { id: number; text: string; tone?: 'warn' }
let notices: Notice[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }
export function notify(text: string, tone?: 'warn') {
  const n = { id: ++seq, text, tone }
  notices = [...notices.slice(-3), n]
  emit()
  setTimeout(() => dismiss(n.id), tone === 'warn' ? 9000 : 5000)
}
export function dismiss(id: number) { notices = notices.filter((n) => n.id !== id); emit() }
export const useNotices = () => useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb) }, () => notices, () => notices)

// Remote changes arrive one row at a time; gather them for a moment so a drag of 6 tasks is one notice.
const LABEL: Record<string, [string, string]> = {
  tasks: ['item', 'items'], phases: ['phase', 'phases'], projects: ['project', 'projects'], people: ['person', 'people'], meeting_notes: ['meeting note', 'meeting notes'],
}
const pending = new Map<string, { by: string | null; table: string; ids: Set<string>; verb: string; timer: ReturnType<typeof setTimeout> }>()
export function noteRemote(table: string, by: string | null, id: string, verb: 'added' | 'changed' | 'removed') {
  const key = `${by}|${table}|${verb}`
  const p = pending.get(key)
  if (p) { p.ids.add(id); return }
  pending.set(key, {
    by, table, verb, ids: new Set([id]),
    timer: setTimeout(() => {
      const g = pending.get(key)!
      pending.delete(key)
      const [one, many] = LABEL[table] ?? ['item', 'items']
      const n = g.ids.size
      notify(`${nameOf(g.by)} ${g.verb} ${n === 1 ? `${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}` : `${n} ${many}`}. Your view is up to date.`)
    }, 1500),
  })
}

// ---------- rows I just wrote (deletes, and tables without updated_by, don't say who did it) ----------
const myWrites = new Map<string, number>()
export const markMine = (id: string) => myWrites.set(id, Date.now())
export const wasMine = (id: string) => { const t = myWrites.get(id); return t !== undefined && Date.now() - t < 10000 }

// ---------- who's here and what they're editing ----------
export interface Here { id: string; name: string; initials: string; editing: string | null; since: number; page: string }
export interface PresenceState { others: Here[]; editing: string | null; since: number }
export const PresenceContext = createContext<PresenceState>({ others: [], editing: null, since: 0 })
/** Others in this project right now. */
export const useOthers = () => useContext(PresenceContext).others
/** Who else is editing this row or note, if anyone. If two of us start on it together, the first one keeps it. */
export function lockHolder(p: PresenceState, id: string | null | undefined): string | null {
  if (!id) return null
  const o = p.others.find((x) => x.editing === id)
  if (!o) return null
  if (p.editing === id && p.since < o.since) return null
  return o.name
}
export const usePresence = () => useContext(PresenceContext)
export const useLockedBy = (id: string | null | undefined) => lockHolder(useContext(PresenceContext), id)
