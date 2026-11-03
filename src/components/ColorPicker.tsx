import { useEffect, useRef, useState } from 'react'
import { projectAccent, projectPalette, ROOT_PRESETS, SCHEMES, textOn } from '../lib/colors.ts'

/** Pick a project's root colour and scheme; previews the phase colours they build. */
export default function ColorPicker({ value, scheme, phaseNames, onChange, onScheme }: {
  value: string | null
  scheme: string | null
  phaseNames: string[]
  onChange: (hex: string | null) => void
  onScheme: (scheme: string) => void
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

  const names = phaseNames.length ? phaseNames : ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6']
  const current = scheme ?? 'balanced'
  const accent = projectAccent(value).accent
  const short = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()

  return (
    <div className="color-pick" ref={box}>
      <button className="swatch-btn" title="Project colours" onClick={() => setOpen(!open)} style={{ background: accent }} aria-label="Project colours" />
      {open && (
        <div className="color-pop">
          <div className="cp-label">Root colour</div>
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

          {value && (
            <>
              <div className="cp-label">Scheme</div>
              <div className="cp-schemes">
                {SCHEMES.map((s) => {
                  const pal = projectPalette(value, names.length, s.id)
                  return (
                    <button key={s.id} className={`cp-scheme${current === s.id ? ' on' : ''}`} onClick={() => onScheme(s.id)} title={s.hint}>
                      <span className="cp-scheme-name">{s.name}</span>
                      <span className="cp-preview">
                        {pal.map((c, i) => <i key={i} style={{ background: c, color: textOn(c) }}>{short(names[i])}</i>)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="cp-hint">{SCHEMES.find((s) => s.id === current)?.hint} The first phase always uses the root colour.</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
