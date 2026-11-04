import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext.ts'
import { useRows } from '../lib/data.ts'
import { dismiss, PresenceContext, rememberName, useNotices, useOthers, type Here } from '../lib/live.ts'
import { useProject } from '../lib/projectContext.ts'
import { supabase } from '../lib/supabase.ts'
import type { Person } from '../lib/types.ts'

const initialsOf = (name: string) => name.split(/[\s@.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

/**
 * Joins the current project's presence channel: shares who I am, which page I'm on and which row or note I'm
 * editing (whatever has focus inside an element marked data-row / data-lock), and collects the same from others.
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { current } = useProject()
  const people = useRows<Person>('people')
  const loc = useLocation()
  const [others, setOthers] = useState<Here[]>([])
  const [mine, setMine] = useState<{ editing: string | null; since: number }>({ editing: null, since: 0 })
  const editing = mine.editing
  const setEditing = (id: string | null) => setMine((m) => (m.editing === id ? m : { editing: id, since: Date.now() }))
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null)

  const uid = session?.user.id ?? null
  const email = session?.user.email ?? ''
  const person = people.rows.find((p) => (p.email ?? '').toLowerCase() === email.toLowerCase())
  const name = person && person.name !== email ? person.name : email.split('@')[0]
  const projectId = current?.id ?? null

  // What I'm editing: the row or note that holds focus.
  useEffect(() => {
    const hold = (e: FocusEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-lock], [data-row]')
      setEditing(el ? (el.dataset.lock ?? el.dataset.row ?? null) : null)
    }
    const leave = () => setTimeout(() => {
      const el = document.activeElement?.closest<HTMLElement>('[data-lock], [data-row]')
      setEditing(el ? (el.dataset.lock ?? el.dataset.row ?? null) : null)
    }, 0)
    document.addEventListener('focusin', hold)
    document.addEventListener('focusout', leave)
    return () => { document.removeEventListener('focusin', hold); document.removeEventListener('focusout', leave) }
  }, [])

  useEffect(() => {
    if (!supabase || !uid || !projectId) return
    const ch = supabase.channel(`presence:${projectId}`, { config: { presence: { key: uid } } })
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<Here>()
      const list: Here[] = []
      for (const [key, metas] of Object.entries(state)) {
        const m = metas[metas.length - 1]
        if (!m) continue
        rememberName(key, m.name)
        if (key !== uid) list.push({ id: key, name: m.name, initials: m.initials, editing: m.editing, since: m.since ?? 0, page: m.page })
      }
      setOthers(list.sort((a, b) => a.name.localeCompare(b.name)))
    })
    ch.subscribe()
    channelRef.current = ch
    return () => { channelRef.current = null; setOthers([]); void supabase!.removeChannel(ch) }
  }, [uid, projectId])

  // Tell the others whenever any of my details change. Tracking before the channel joins is retried.
  useEffect(() => {
    const ch = channelRef.current
    if (!ch || !uid) return
    rememberName(uid, name)
    const meta = { id: uid, name, initials: person?.initials || initialsOf(name), editing, since: mine.since, page: loc.pathname }
    let tries = 0
    const go = () => { void ch.track(meta).then((r) => { if (r !== 'ok' && ++tries < 5) setTimeout(go, 600) }) }
    go()
  }, [uid, name, person?.initials, editing, mine.since, loc.pathname, projectId])

  const value = useMemo(() => ({ others, editing: mine.editing, since: mine.since }), [others, mine])
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>
}

const PAGE: Record<string, string> = { '/overview': 'Overview', '/schedule': 'Schedule', '/notes': 'Meeting notes', '/team': 'Team', '/settings': 'Settings', '/': 'All projects' }

/** Small faces for the others in this project (sidebar). */
export function WhosHere() {
  const others = useOthers()
  if (!others.length) return null
  return (
    <div className="whos-here" aria-label="Also in this project">
      <span className="muted small">Also here</span>
      <span className="wh-faces">
        {others.slice(0, 5).map((o) => <span key={o.id} className="wh-face" title={`${o.name} · ${PAGE[o.page] ?? o.page}`}>{o.initials}</span>)}
        {others.length > 5 && <span className="wh-face more" title={others.slice(5).map((o) => o.name).join(', ')}>+{others.length - 5}</span>}
      </span>
    </div>
  )
}

/** Notices about other people's changes, bottom right. */
export function Notices() {
  const list = useNotices()
  if (!list.length) return null
  return (
    <div className="notices no-print" role="status">
      {list.map((n) => (
        <div key={n.id} className={`notice-toast${n.tone === 'warn' ? ' warn' : ''}`}>
          <span>{n.text}</span>
          <button className="linkbtn" aria-label="Dismiss" onClick={() => dismiss(n.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
