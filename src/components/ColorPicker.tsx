import { useEffect, useRef, useState } from 'react'
import { projectAccent, projectPalette, ROOT_PRESETS } from '../lib/colors.ts'

/** Pick a project's root colour; shows the phase palette it builds. */
export default function ColorPicker({ value, phaseCount, onChange }: {
  value: string | null
  phaseCount: number
  onChange: (hex: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const preview = projectPalette(value, Math.max(phaseCount, 6))
  const accent = projectAccent(value).accent

  return (
    <div className="color-pick" ref={box}>
      <button className="swatch-btn" title="Project colour" onClick={() => setOpen(!open)} style={{ background: accent }} aria-label="Project colour" />
      {open && (
        <div className="color-pop">
          <div className="cp-label">Project colour</div>
          <div className="cp-presets">
            {ROOT_PRESETS.map((c) => (
              <button key={c.hex} title={c.name} className={value?.toLowerCase() === c.hex ? 'on' : ''}
                style={{ background: c.hex }} onClick={() => onChange(c.hex)} />
            ))}
          </div>
          <div className="cp-row">
            <label className="cp-custom">
              <input type="color" value={value ?? '#6b8f71'} onChange={(e) => onChange(e.target.value)} />
              Custom…
            </label>
            {value && <button className="btn ghost" onClick={() => onChange(null)}>Use default</button>}
          </div>
          <div className="cp-label">Phase colours it builds</div>
          <div className="cp-preview">{preview.map((c, i) => <i key={i} style={{ background: c }} />)}</div>
        </div>
      )}
    </div>
  )
}
