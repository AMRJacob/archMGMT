import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import ScheduleChart, { type ChartMode } from '../components/ScheduleChart.tsx'
import { useRows } from '../lib/data.ts'
import { today } from '../lib/dates.ts'
import { FIRM_NAME } from '../lib/brand.ts'
import { useProject } from '../lib/projectContext.ts'
import type { Person, Phase, Task } from '../lib/types.ts'

export default function Schedule() {
  const { current: project } = useProject()
  const id = project?.id ?? ''
  const phases = useRows<Phase>('phases', { project_id: id })
  const tasks = useRows<Task>('tasks', { project_id: id })
  const people = useRows<Person>('people')
  const [mode, setMode] = useState<ChartMode>('client')
  const svg = useRef<SVGSVGElement>(null)
  const [saving, setSaving] = useState(false)

  if (!project) return <p>No project chosen. <Link to="/">See all projects</Link></p>

  const fileBase = `${[project.number, project.name].filter(Boolean).join(' ')} schedule ${today()}`.replace(/[\\/:*?"<>|]/g, '')

  async function downloadPng() {
    const el = svg.current
    if (!el) return
    setSaving(true)
    try {
      const [, , w, h] = el.getAttribute('viewBox')!.split(' ').map(Number)
      const markup = new XMLSerializer().serializeToString(el)
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
      const img = new Image()
      await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('Could not draw the schedule')); img.src = url })
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')!
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
      if (!blob) throw new Error('Could not create the image')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${fileBase}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } finally {
      setSaving(false)
    }
  }

  const hidden = mode === 'client'
    ? { phases: phases.rows.filter((p) => !p.client_visible).length, tasks: tasks.rows.filter((t) => !t.client_visible).length }
    : null

  return (
    <section>
      <header className="page-head no-print">
        <div>
          <h1>Schedule</h1>
          <p className="muted">
            {project.number ? `${project.number} · ` : ''}{project.name}. Edit dates on the <Link to="/overview">Overview</Link>; the chart updates.
          </p>
        </div>
        <div className="toolbar">
          <div className="segmented" role="tablist" aria-label="View">
            <button className={mode === 'client' ? 'on' : ''} onClick={() => setMode('client')}>Client view</button>
            <button className={mode === 'internal' ? 'on' : ''} onClick={() => setMode('internal')}>Internal view</button>
          </div>
          <button className="btn" onClick={downloadPng} disabled={saving}>Download PNG</button>
          <button className="btn primary" onClick={() => window.print()}>Save as PDF</button>
        </div>
      </header>

      {hidden && (
        <p className="muted small no-print hint">
          Client view shows phases marked “On client schedule” and tasks marked “Client” (usually milestones).
          {hidden.tasks > 0 && ` ${hidden.tasks} internal task${hidden.tasks === 1 ? ' is' : 's are'} hidden.`}
          {hidden.phases > 0 && ` ${hidden.phases} phase${hidden.phases === 1 ? ' is' : 's are'} hidden.`}
        </p>
      )}

      <div className="card chart-card print-area">
        <ScheduleChart project={project} phases={phases.rows} tasks={tasks.rows} people={people.rows}
          mode={mode} firmName={FIRM_NAME} svgRef={svg} />
      </div>
      <p className="muted small no-print">
        “Save as PDF” opens the print dialog: choose <strong>Save as PDF</strong> as the printer. The page is set to landscape.
      </p>
    </section>
  )
}
