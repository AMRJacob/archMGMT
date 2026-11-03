import { useRef, useState } from 'react'
import { exportAll, importAll, removeSampleData, sampleRowCount, usingSampleData, type Backup } from '../lib/data.ts'
import { today } from '../lib/dates.ts'

export default function Settings() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [samples, setSamples] = useState(() => sampleRowCount())
  const file = useRef<HTMLInputElement>(null)

  async function backup() {
    setError(null)
    try {
      const b = await exportAll()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }))
      a.download = `archmgmt-backup-${today()}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      const n = Object.values(b.tables).reduce((s, rows) => s + rows.length, 0)
      setMessage(`Backup downloaded (${n} records).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function restore(f: File) {
    setError(null)
    try {
      const b = JSON.parse(await f.text()) as Backup
      if (!window.confirm(`Restore from ${f.name}? Records in the file are added or updated; nothing else is deleted.`)) return
      const n = await importAll(b)
      setMessage(`Restored ${n} records. Reloading…`)
      setTimeout(() => window.location.reload(), 800)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (file.current) file.current.value = ''
    }
  }

  function clearSamples() {
    if (!window.confirm(`Remove all ${samples} sample records (the "Sample …" people and projects)? Anything you added yourself stays. Consider downloading a backup first.`)) return
    removeSampleData()
    setSamples(sampleRowCount())
    setMessage('Sample data removed. Reloading…')
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Settings &amp; data</h1>
          <p className="muted">Keep your data safe while the app is being built.</p>
        </div>
      </header>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <div className="card pad">
        <h2>Where data is stored</h2>
        {usingSampleData ? (
          <p>
            <strong>In this browser only.</strong> Updates to the app keep your data, but clearing browser data, a different
            browser or another computer won't have it. Download a backup regularly until the shared database is connected.
            The backup file is also how this data moves into the shared database.
          </p>
        ) : (
          <p><strong>In the shared database.</strong> Everyone signed in sees the same data.</p>
        )}
      </div>

      <div className="card pad">
        <h2>Backup and restore</h2>
        <p className="muted">A backup is one file with every person, project, phase, task and time-off entry.</p>
        <div className="row-gap">
          <button className="btn primary" onClick={backup}>Download backup</button>
          <button className="btn" onClick={() => file.current?.click()}>Restore from backup…</button>
          <input ref={file} type="file" accept="application/json,.json" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f) }} />
        </div>
      </div>

      {usingSampleData && (
        <div className="card pad">
          <h2>Sample data</h2>
          <p className="muted">
            {samples > 0
              ? `${samples} sample records are mixed in with your data. Remove them when you're ready to work with real projects only.`
              : 'No sample records left.'}
          </p>
          {samples > 0 && <div className="row-gap"><button className="btn danger" onClick={clearSamples}>Remove sample data</button></div>}
        </div>
      )}
    </section>
  )
}
