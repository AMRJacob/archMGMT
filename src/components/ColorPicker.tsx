import { useEffect, useRef, useState } from 'react'
import { decodeBrand, encodeBrand, projectAccent, projectPalette, ROOT_PRESETS, SCHEMES, textOn } from '../lib/colors.ts'
import { useRows } from '../lib/data.ts'
import type { BrandPalette } from '../lib/types.ts'

/** Pick a project's root colour and scheme; previews the phase colours they build. */
export default function ColorPicker({ value, scheme, phaseNames, onChange, onScheme }: {
  value: string | null
  scheme: string | null
  phaseNames: string[]
  onChange: (hex: string | null) => void
  onScheme: (scheme: string) => void
}) {
  const [open, setOpen] = useState(false)
  const brands = useRows<BrandPalette>('brand_palettes')
  const brand = decodeBrand(scheme)
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
  // The brand colours this project uses, in order (empty when it uses a generated scheme).
  const picked = brand?.colors ?? []
  const applyColors = (colors: string[], name: string) => {
    if (!colors.length) return
    onChange(colors[0])
    onScheme(encodeBrand(name, colors))
  }
  /** Name for a hand-picked set: the palette's name when every colour comes from one palette. */
  const nameFor = (colors: string[], fallback: string) => {
    const one = brands.rows.find((b) => colors.every((c) => b.colors.includes(c)))
    return one?.name ?? (fallback || 'Brand colours')
  }
  const toggle = (c: string, from: string) => {
    if (picked.includes(c)) {
      const rest = picked.filter((x) => x !== c)
      if (rest.length) applyColors(rest, nameFor(rest, brand?.name ?? from))
      return
    }
    const next = brand ? [...picked, c] : [c]
    applyColors(next, nameFor(next, 'Mixed brand colours'))
  }
  const short = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()

  return (
    <div className="color-pick" ref={box}>
      <button className="swatch-btn" title="Project colours" onClick={() => setOpen(!open)} style={{ background: accent }} aria-label="Project colours" />
      {open && (
        <div className="color-pop">
          {brands.rows.length > 0 && (
            <>
              <div className="cp-label">Brand palettes</div>
              <div className="cp-brands">
                {[...brands.rows].sort((a, b) => a.name.localeCompare(b.name)).map((b) => {
                  const all = brand !== null && brand.colors.length === b.colors.length && b.colors.every((c, i) => brand.colors[i] === c)
                  return (
                    <div key={b.id} className={`cp-brand${all ? ' on' : ''}`} title={b.notes ?? b.name}>
                      <button className="cp-brand-name" title={`Use all ${b.name} colours`} onClick={() => applyColors(b.colors, b.name)}>{b.name}</button>
                      <span className="cp-brand-chips">
                        {b.colors.map((c, i) => {
                          const n = picked.indexOf(c)
                          return (
                            <button key={i} className={`cp-chip${n >= 0 ? ' on' : ''}`} style={{ background: c, color: textOn(c) }}
                              title={n >= 0 ? `${c}: phase colour ${n + 1}. Click to leave it out.` : `${c}: click to add`}
                              onClick={() => toggle(c, b.name)}>{n >= 0 ? n + 1 : ''}</button>
                          )
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
              {brand
                ? <p className="cp-hint">Phases use {picked.length === 1 ? 'this colour' : `these ${picked.length} colours in the numbered order`}. Click palette names to use a whole palette, or single colours (from any palette) to pick your own set. Pick a scheme below to go back to generated colours.</p>
                : <p className="cp-hint">Click a palette name to use all its colours, or click single colours, in the order you want them, to use just those.</p>}
            </>
          )}
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
              <div className="cp-label">{brand ? 'Or a generated scheme' : 'Scheme'}</div>
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
              {!brand && <p className="cp-hint">{SCHEMES.find((s) => s.id === current)?.hint} The first phase always uses the root colour.</p>}
              {brands.rows.length === 0 && <p className="cp-hint">Save a client’s brand colours in Settings → Brand palettes to use them here.</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
