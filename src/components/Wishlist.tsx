import { useEffect, useState } from 'react'
import { TextField } from './fields.tsx'
import { useAuth } from '../auth/authContext.ts'
import { useRows } from '../lib/data.ts'
import { formatDate } from '../lib/dates.ts'
import { supabase } from '../lib/supabase.ts'
import { WISH_STATUSES, type WishItem, type WishStatus } from '../lib/types.ts'

/**
 * Settings → Wishlist & problems: anyone can ask for something or report a problem; admins set the status
 * and reply. Open items first; closed ones (complete, infeasible, duplicate) fold away.
 */
export default function Wishlist() {
  const items = useRows<WishItem>('wishlist')
  const { session } = useAuth()
  const me = session?.user.email?.toLowerCase() ?? null
  const [admin, setAdmin] = useState(!supabase) // browser-only mode: you're the admin
  const [kind, setKind] = useState<WishItem['kind']>('wish')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    void supabase.rpc('am_i_admin').then(({ data }) => setAdmin(Boolean(data)))
  }, [])

  const closed = (s: WishStatus) => WISH_STATUSES.find((x) => x.value === s)?.closed ?? false
  const sorted = [...items.rows].sort((a, b) => a.sort_order - b.sort_order || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const open = sorted.filter((x) => !closed(x.status))
  const done = sorted.filter((x) => closed(x.status))

  async function submit() {
    if (!title.trim()) return
    setError(null)
    try {
      await items.add({
        kind, title: title.trim(), details: details.trim() || null, status: 'new', submitted_by: me,
        sort_order: items.rows.reduce((m, x) => Math.max(m, x.sort_order), 0) + 1,
      })
      setTitle(''); setDetails('')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const patch = (x: WishItem, c: Partial<WishItem>) => void items.patch(x.id, { ...c, updated_at: new Date().toISOString() })

  const row = (x: WishItem) => {
    const canEdit = admin || (me && x.submitted_by === me)
    return (
      <li key={x.id} className={`wish ${x.status}`}>
        <div className="wish-head">
          <span className={`wish-kind ${x.kind}`}>{x.kind === 'problem' ? 'Problem' : 'Wish'}</span>
          {canEdit
            ? <TextField value={x.title} className="wish-title" onSave={(v) => v && patch(x, { title: v })} />
            : <strong className="wish-title">{x.title}</strong>}
          {admin
            ? (
              <select className={`field wish-status st-${x.status}`} value={x.status} onChange={(e) => patch(x, { status: e.target.value as WishStatus })}>
                {WISH_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            )
            : <span className={`wish-status st-${x.status}`}>{WISH_STATUSES.find((s) => s.value === x.status)?.label}</span>}
          {admin && <button className="icon-btn" title="Delete" onClick={() => { if (window.confirm(`Delete "${x.title}"?`)) void items.drop(x.id) }}>×</button>}
        </div>
        {canEdit
          ? <TextField multiline value={x.details} placeholder="Details" className="wish-details" onSave={(v) => patch(x, { details: v })} />
          : x.details && <p className="wish-details">{x.details}</p>}
        {(admin || x.response) && (
          <div className="wish-response">
            <span className="muted small">Reply</span>
            {admin
              ? <TextField multiline value={x.response} placeholder="Status notes, plans, why it’s closed…" onSave={(v) => patch(x, { response: v })} />
              : <p>{x.response}</p>}
          </div>
        )}
        <div className="muted small">{x.submitted_by ?? 'Someone'}{x.created_at ? ` · ${formatDate(x.created_at.slice(0, 10))}` : ''}</div>
      </li>
    )
  }

  return (
    <div className="card pad">
      <h2>Wishlist &amp; problems</h2>
      <p className="muted">
        Ask for something the app should do, or tell us what’s not working. Everyone can see the list and its status.
        {admin && <> Set an item to <strong>Approved – ready to build</strong> when it should be built next.</>}
      </p>
      <div className="wish-form">
        <div className="segmented small-seg" role="radiogroup" aria-label="Kind">
          <button role="radio" aria-checked={kind === 'wish'} className={kind === 'wish' ? 'on' : ''} onClick={() => setKind('wish')}>Wish</button>
          <button role="radio" aria-checked={kind === 'problem'} className={kind === 'problem' ? 'on' : ''} onClick={() => setKind('problem')}>Problem</button>
        </div>
        <input className="field boxed" placeholder={kind === 'wish' ? 'What would you like it to do?' : 'What went wrong?'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="field boxed" rows={2} placeholder={kind === 'wish' ? 'Details (optional)' : 'What you were doing and what happened (optional)'} value={details} onChange={(e) => setDetails(e.target.value)} />
        <button className="btn primary" disabled={!title.trim()} onClick={() => void submit()}>Add</button>
      </div>
      {error && <p className="error small">{error}</p>}
      <ul className="wish-list">{open.map(row)}</ul>
      {open.length === 0 && <p className="muted small">Nothing open.</p>}
      {done.length > 0 && (
        <>
          <button className="linkbtn" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Hide' : 'Show'} {done.length} closed</button>
          {showClosed && <ul className="wish-list closed">{done.map(row)}</ul>}
        </>
      )}
    </div>
  )
}
