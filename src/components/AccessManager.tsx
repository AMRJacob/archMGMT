import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { accessCall, createSignInLink, type AccountRow } from '../lib/access.ts'
import { insert, list, useRows } from '../lib/data.ts'
import { TextField } from './fields.tsx'
import { formatDate } from '../lib/dates.ts'
import type { Person } from '../lib/types.ts'

/**
 * Settings → Who has access (admins only). Add someone by email to get a one-time sign-in link to
 * send them yourself; no email is sent by the app. Existing people can get a new link (password reset)
 * or lose access.
 */
export default function AccessManager({ myEmail }: { myEmail: string | undefined }) {
  const [rows, setRows] = useState<AccountRow[] | null>(null)
  const [denied, setDenied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [team, setTeam] = useState<'staff' | 'consultant' | 'none'>('staff')
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState<{ email: string; url: string; note: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const people = useRows<Person>('people')
  const personFor = (e: string) => people.rows.find((p) => (p.email ?? '').toLowerCase() === e.toLowerCase())

  const load = useCallback(async () => {
    try {
      const r = await accessCall<{ users: AccountRow[] }>({ action: 'list' })
      setRows(r.users); setDenied(null)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      if (/admin/i.test(m)) setDenied(m); else setError(m)
    }
  }, [])
  // oxlint-disable-next-line react/set-state-in-effect -- loading from the server
  useEffect(() => { void load() }, [load])

  async function makeLink(target: string, who: string) {
    setBusy(true); setError(null); setCopied(false)
    try {
      const r = await createSignInLink(target)
      setLink({
        email: target, url: r.link,
        note: r.type === 'recovery'
          ? `${who} already has an account; this link lets them set a new password.`
          : `This link creates ${who}’s account and lets them choose a password.${r.addedToAccessList ? ' (Outside AMR: added to the access list.)' : ''}`,
      })
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    const target = email.trim().toLowerCase()
    if (!target) return
    const who = name.trim() || target
    // Also put them on the Team list (once), so they can be assigned work.
    if (team !== 'none') {
      try {
        const people = await list<Person>('people')
        if (!people.some((p) => (p.email ?? '').toLowerCase() === target)) {
          await insert<Person>('people', {
            name: who, email: target, kind: team, weekly_hours: team === 'staff' ? 40 : 0, availability: 100, active: true,
            initials: who.includes('@') ? null : who.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase(),
          })
        }
      } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
    }
    await makeLink(target, who)
    setEmail(''); setName('')
  }

  /** A name for an account lives on its Team entry; one is created if there isn't one yet. */
  async function saveName(target: string, n: string | null) {
    const name = (n ?? '').trim()
    if (!name) return
    const p = personFor(target)
    const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
    try {
      if (p) await people.patch(p.id, { name, initials: p.initials && p.name !== p.email ? p.initials : initials })
      else await people.add({ name, email: target, initials, kind: 'staff', weekly_hours: 40, availability: 100, active: true })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function setTeamKind(target: string, kind: 'staff' | 'consultant' | 'none') {
    const p = personFor(target)
    try {
      if (kind === 'none') { if (p) await people.patch(p.id, { active: false }); return }
      if (p) await people.patch(p.id, { kind, active: true })
      else await people.add({ name: target.split('@')[0], email: target, kind, weekly_hours: kind === 'staff' ? 40 : 0, availability: 100, active: true })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  async function removeAccess(target: string) {
    if (!window.confirm(`Remove ${target}’s access to archMGMT? Their sign-in is deleted; their tasks and Team entry stay.`)) return
    setBusy(true); setError(null)
    try { await accessCall({ action: 'remove', email: target }); if (link?.email === target) setLink(null); await load() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link.url); setCopied(true) } catch { setCopied(false) }
  }

  if (denied) {
    return (
      <div className="card pad">
        <h2>Who has access</h2>
        <p className="muted">Only archMGMT admins can add people. Ask an admin for a sign-in link.</p>
      </div>
    )
  }

  return (
    <div className="card pad access">
      <h2>Who has access</h2>
      <p className="muted">
        Add someone to get a one-time sign-in link, then send it to them yourself (Teams, email, text). The app doesn’t send
        anything. Opening the link lets them choose a password. Links work once and expire after about an hour.
      </p>

      <form className="access-add" onSubmit={add}>
        <input className="field boxed" type="email" required placeholder="name@amr-architects.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="field boxed" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="field boxed" value={team} onChange={(e) => setTeam(e.target.value as typeof team)} title="Also add them to the Team list">
          <option value="staff">Add to Team as staff</option>
          <option value="consultant">Add to Team as consultant</option>
          <option value="none">Sign-in only (not on Team)</option>
        </select>
        <button className="btn primary" disabled={busy || !email.trim()}>{busy ? 'Working…' : 'Add & create link'}</button>
      </form>

      {link && (
        <div className="sl-box">
          <p className="small"><strong>Link for {link.email}.</strong> {link.note} Send it now; it works once.</p>
          <div className="sl-row">
            <input className="field boxed" readOnly value={link.url} onFocus={(e) => e.target.select()} />
            <button className="btn primary" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
          </div>
        </div>
      )}
      {error && <p className="error small">{error}</p>}

      <table className="table access-table">
        <thead>
          <tr><th style={{ width: 210 }}>Name</th><th>Email</th><th style={{ width: 150 }}>On Team</th><th style={{ width: 180 }}>Status</th><th style={{ width: 250 }} /></tr>
        </thead>
        <tbody>
          {(rows ?? []).map((u) => (
            <tr key={u.email}>
              <td><AccountName email={u.email} person={personFor(u.email)} onSave={(n) => saveName(u.email, n)} /></td>
              <td>{u.email}{u.admin && <span className="chip admin-chip">Admin</span>}{u.email === myEmail && <span className="muted small"> (you)</span>}</td>
              <td>
                <select className="field" value={personFor(u.email)?.active ? personFor(u.email)!.kind : 'none'} title="Whether they're on the Team list (to be assigned work)"
                  onChange={(e) => void setTeamKind(u.email, e.target.value as 'staff' | 'consultant' | 'none')}>
                  <option value="staff">Staff</option>
                  <option value="consultant">Consultant</option>
                  <option value="none">Not on Team</option>
                </select>
              </td>
              <td className="small">
                {u.last_sign_in_at ? <span className="muted">Last signed in {formatDate(u.last_sign_in_at.slice(0, 10))}</span> : <span className="pending">Link sent, not signed in yet</span>}
              </td>
              <td className="right-actions">
                <button className="btn ghost" disabled={busy} onClick={() => makeLink(u.email, u.email)}>{u.last_sign_in_at ? 'Password reset link' : 'New link'}</button>
                {u.email !== myEmail && <button className="btn ghost danger" disabled={busy} onClick={() => removeAccess(u.email)}>Remove access</button>}
              </td>
            </tr>
          ))}
          {rows === null && !error && <tr><td colSpan={5} className="empty small">Loading…</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/** The editable name for one account. */
function AccountName({ email, person, onSave }: { email: string; person: Person | undefined; onSave: (n: string | null) => void }) {
  const name = person && person.name !== email ? person.name : null
  return <TextField value={name} placeholder="Add name" onSave={onSave} />
}

/** "Your name" in Settings → Your account: kept on your Team entry (created if needed). */
export function MyName({ email }: { email: string }) {
  const people = useRows<Person>('people')
  const me = people.rows.find((p) => (p.email ?? '').toLowerCase() === email.toLowerCase())
  return (
    <label className="my-name">
      <span className="muted small">Your name</span>
      <TextField value={me && me.name !== email ? me.name : null} placeholder="Add your name"
        onSave={(n) => {
          const name = (n ?? '').trim()
          if (!name) return
          const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
          if (me) void people.patch(me.id, { name, initials })
          else void people.add({ name, email, initials, kind: 'staff', weekly_hours: 40, availability: 100, active: true })
        }} />
    </label>
  )
}
