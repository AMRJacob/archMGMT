import { useState } from 'react'
import { setTitleBlock, useTitleBlock, type TitleBlock } from '../lib/titleBlock.ts'
import { TitleBlockView } from './NotePrint.tsx'
import type { Project } from '../lib/types.ts'

const SAMPLE: Project = { id: 'x', number: '2026-014', name: 'Sample Project', client: null, status: 'active', pm_id: null, color: null, start_date: null, end_date: null, notes: null }

/** Placeholder: the title block on exported meeting notes. The CAzen title block creator will replace this. */
export default function TitleBlockSettings() {
  const tb = useTitleBlock()
  const [open, setOpen] = useState(false)
  const field = (k: keyof TitleBlock, label: string, multi = false) => (
    <label className="tb-field">
      <span className="muted small">{label}</span>
      {multi
        ? <textarea className="field boxed" rows={2} defaultValue={tb[k]} onBlur={(e) => setTitleBlock({ ...tb, [k]: e.target.value })} />
        : <input className="field boxed" defaultValue={tb[k]} onBlur={(e) => setTitleBlock({ ...tb, [k]: e.target.value })} />}
    </label>
  )
  return (
    <div className="card pad">
      <div className="card-head-row">
        <h2>Meeting Notes Title Block</h2>
        <button className="btn" onClick={() => setOpen(!open)}>{open ? 'Done' : 'Edit'}</button>
      </div>
      <p className="muted small">Printed at the top of every exported meeting note. A placeholder for now; the title block creator from CAzen will replace it. Saved in this browser.</p>
      <div className="tb-preview"><TitleBlockView tb={tb} project={SAMPLE} title="OAC Meeting #4" date="2026-11-04" kind="Owner" /></div>
      {open && (
        <div className="tb-fields">
          {field('firm', 'Firm name')}
          {field('address', 'Address')}
          {field('phone', 'Phone')}
          {field('website', 'Website')}
          {field('footer', 'Footer note', true)}
        </div>
      )}
    </div>
  )
}
