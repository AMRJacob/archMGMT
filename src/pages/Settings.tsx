import ThemePicker from '../components/ThemePicker.tsx'
import BrandPalettes from '../components/BrandPalettes.tsx'
import TitleBlockSettings from '../components/TitleBlockSettings.tsx'
import StorageUsage from '../components/StorageUsage.tsx'
import { MyName } from '../components/AccessManager.tsx'
import { useRef, useState } from 'react'
import { NavLink, Navigate, useParams } from 'react-router-dom'
import Wishlist from '../components/Wishlist.tsx'
import { ChangePassword } from '../auth/Auth.tsx'
import AccessManager from '../components/AccessManager.tsx'
import { useAuth } from '../auth/authContext.ts'
import {
  exportAll, importAll, list, remove, removeSampleData, sampleRowCount, usingSampleData, type Backup,
} from '../lib/data.ts'
import { today } from '../lib/dates.ts'
import type { Person, Project } from '../lib/types.ts'

/** Settings is split into sections, each at /settings/<id>, listed down the left of the page. */
const SECTIONS = [
  { id: 'general', name: 'General', blurb: 'How the app looks for you.' },
  { id: 'branding', name: 'Branding & Printing', blurb: 'Client brand colours and what printed meeting notes carry.' },
  { id: 'wishlist', name: 'Wishlist & Errors', blurb: 'Ask for something the app should do, or tell us what’s not working. Everyone can see the list and its status.' },
  { id: 'access', name: 'Access', blurb: 'Your account, and who can sign in to archMGMT.' },
  { id: 'data', name: 'Data', blurb: 'Where data lives, how much room it takes, backups and sample data.' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

export default function Settings() {
  const { section = 'general' } = useParams()
  const { session } = useAuth()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [samples, setSamples] = useState(() => sampleRowCount())
  const file = useRef<HTMLInputElement>(null)

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  const done = (m: string, reload = false) => { setMessage(m); if (reload) setTimeout(() => window.location.reload(), 900) }

  async function backup() {
    setError(null)
    try {
      const b = await exportAll()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }))
      a.download = `archmgmt-backup-${today()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      done(`Backup downloaded (${Object.values(b.tables).reduce((s, rows) => s + rows.length, 0)} records).`)
    } catch (e) { fail(e) }
  }

  async function restore(f: File) {
    setError(null)
    try {
      const b = JSON.parse(await f.text()) as Backup
      if (!window.confirm(`Restore from ${f.name}? Records in the file are added or updated; nothing else is deleted.`)) return
      setBusy(true)
      done(`Restored ${await importAll(b)} records. Reloading…`, true)
    } catch (e) { fail(e) } finally { setBusy(false); if (file.current) file.current.value = '' }
  }

  async function clearSamples() {
    if (usingSampleData) {
      if (!window.confirm(`Remove all ${samples} sample records? Anything you added yourself stays. Consider downloading a backup first.`)) return
      removeSampleData()
      setSamples(sampleRowCount())
      done('Sample data removed. Reloading…', true)
      return
    }
    // Shared database: sample projects are named "Sample …"; sample people have an @example.com email (or an old "Sample …" name).
    try {
      const ps = (await list<Project>('projects')).filter((p) => p.name.startsWith('Sample '))
      const people = (await list<Person>('people')).filter((p) => p.name.startsWith('Sample ') || (p.email ?? '').toLowerCase().endsWith('@example.com'))
      if (!ps.length && !people.length) { done('No sample projects or people in the shared database.'); return }
      if (!window.confirm(`Remove ${ps.length} sample project(s) with their phases and tasks, and ${people.length} sample people, from the shared database? Download a backup first if unsure.`)) return
      setBusy(true)
      for (const p of ps) await remove('projects', p.id)
      for (const p of people) await remove('people', p.id)
      done('Sample data removed. Reloading…', true)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const cur = SECTIONS.find((x) => x.id === section)
  if (!cur) return <Navigate to="/settings" replace />
  const show = (id: SectionId) => cur.id === id

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Settings &amp; Data</h1>
          <p className="muted">{cur.blurb}</p>
        </div>
      </header>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((x) => (
            <NavLink key={x.id} to={x.id === 'general' ? '/settings' : `/settings/${x.id}`} end
              className={() => (x.id === cur.id ? 'active' : '')}>{x.name}</NavLink>
          ))}
        </nav>
        <div className="settings-body">
          {show('general') && <ThemePicker />}

          {show('branding') && <>
            <BrandPalettes />
            <TitleBlockSettings />
          </>}

          {show('wishlist') && <Wishlist />}

          {show('access') && <>
            {session && (
              <div className="card pad">
                <h2>Your Account</h2>
                <p className="muted">Signed in as <strong>{session.user.email}</strong>.</p>
                {session.user.email && <MyName email={session.user.email} />}
                <ChangePassword />
              </div>
            )}
            {session
              ? <AccessManager myEmail={session.user.email} />
              : <div className="card pad"><h2>Who Has Access</h2><p className="muted">Access is managed once the shared database is connected.</p></div>}
          </>}

          {show('data') && <>
          <div className="card pad">
            <h2>Where Data Is Stored</h2>
            {usingSampleData ? (
              <p><strong>In this browser only.</strong> Download a backup regularly; the backup file is also how this data moves into the shared database.</p>
            ) : (
              <p><strong>In the shared database.</strong> Everyone signed in with an @amr-architects.com address (or added to the access list) sees the same data.</p>
            )}
          </div>
            <StorageUsage />
          <div className="card pad">
            <h2>Backup and Restore</h2>
            <p className="muted">A backup is one file with every person, project, phase, task and time-off entry.</p>
            <div className="row-gap">
              <button className="btn primary" onClick={backup} disabled={busy}>Download backup</button>
              <button className="btn" onClick={() => file.current?.click()} disabled={busy}>Restore from backup…</button>
              <input ref={file} type="file" accept="application/json,.json" hidden
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f) }} />
            </div>
          </div>
          <div className="card pad">
            <h2>Sample Data</h2>
            <p className="muted">
              {usingSampleData
                ? (samples > 0 ? `${samples} sample records are mixed in with your data.` : 'No sample records left.')
                : 'Remove the “Sample …” projects and the sample people (Ralph, Susan and Betty) once you’re working with real projects only.'}
            </p>
            {(!usingSampleData || samples > 0) && <div className="row-gap"><button className="btn danger" onClick={clearSamples} disabled={busy}>Remove sample data</button></div>}
          </div>
          </>}
        </div>
      </div>
    </section>
  )
}
