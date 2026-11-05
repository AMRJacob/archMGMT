import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.ts'

/** Supabase Free plan: 500 MB of database per project (supabase.com/pricing). Change if the plan changes. */
const PLAN = { name: 'Supabase Free plan', bytes: 500 * 1024 * 1024 }
const LABEL: Record<string, string> = { tasks: 'Tasks, sheets, spec sections & subtasks', phases: 'Phases', projects: 'Projects', people: 'People', meeting_notes: 'Meeting notes', time_off: 'Time off', brand_palettes: 'Brand palettes', wishlist: 'Wishlist', access: 'Access list' }

const mb = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(b < 100 * 1024 * 1024 ? 1 : 0)} MB`)

/** How close the shared database is to the plan's limit. */
export default function StorageUsage() {
  const [u, setU] = useState<{ database_bytes: number; tables: { name: string; bytes: number; rows: number }[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!supabase) return
    void supabase.rpc('storage_usage').then(({ data, error }) => { if (error) setErr(error.message); else setU(data as typeof u) })
  }, [])
  if (!supabase) return null
  const share = u ? u.database_bytes / PLAN.bytes : 0
  const app = u ? u.tables.reduce((s, t) => s + t.bytes, 0) : 0
  return (
    <div className="card pad">
      <h2>Storage</h2>
      {err && <p className="muted small">Couldn’t read storage use: {err}</p>}
      {!u && !err && <p className="muted small">Checking…</p>}
      {u && (
        <>
          <p><strong>{mb(u.database_bytes)}</strong> of {mb(PLAN.bytes)} used ({(share * 100).toFixed(share < 0.1 ? 1 : 0)}%) · {PLAN.name}</p>
          <div className={`usage-bar${share > 0.8 ? ' high' : ''}`}><span style={{ width: `${Math.max(0.5, Math.min(100, share * 100))}%` }} /></div>
          <p className="muted small">
            archMGMT’s own data is {mb(app)}; the rest is the database’s built-in system tables. Supabase suggests planning an upgrade well before the limit
            (the Pro plan includes 8 GB).
          </p>
          <table className="table usage-table">
            <tbody>
              {u.tables.filter((t) => t.bytes > 0).map((t) => (
                <tr key={t.name}><td>{LABEL[t.name] ?? t.name}</td><td className="num muted">{t.rows >= 0 ? `${t.rows.toLocaleString()} rows` : ''}</td><td className="num">{mb(t.bytes)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
