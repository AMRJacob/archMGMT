import { useEffect, useRef, useState } from 'react'
import { decodeBrand, encodeBrand, projectAccent, projectPalette, ROOT_PRESETS, SCHEMES, textOn } from '../lib/colors.ts'
import { useRows } from '../lib/data.ts'
import type { BrandPalette } from '../lib/types.ts'

/**
 * A project's colours, in two steps:
 *  1. Base colour: any saved brand colour, a preset or a custom colour. Phase 1 uses it exactly.
 *  2. Scheme: Balanced / Triad / Complementary build the other phases from the base, or "Brand colours" uses
 *     brand colours you pick by hand, in order (from one palette or several).
 * Both are saved together in one change (color + color_scheme).
 */
export default function ColorPicker({ value, scheme, phaseNames, onChange }: {
  value: string | null
  scheme: string | null
  phaseNames: string[]
  onChange: (c: { color?: string | null; color_scheme?: string | null }) => void
}) {
  const [open, setOpen] = useState(false)
  const brands = useRows<BrandPalette>('brand_palettes')
  const palettes = [...brands.rows].sort((a, b) => a.name.localeCompare(b.name))
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
  const short = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  const base = value ?? null
  const accent = projectAccent(base ?? brand?.colors[0]).accent
  const generated = brand ? null : (scheme ?? 'balanced')

  /** The palette a colour belongs to (for naming a hand-picked set). */
  const paletteWith = (cs: string[]) => palettes.find((p) => cs.every((c) => p.colors.includes(c)))
  const brandScheme = (cs: string[]) => encodeBrand(paletteWith(cs)?.name ?? 'Brand colours', cs)

  // ---- step 1: base ----
  const setBase = (c: string | null) => {
    // With brand colours as the scheme, the base leads the list (phase 1 is the base).
    if (brand && c) {
      const rest = brand.colors.filter((x) => x !== c)
      onChange({ color: c, color_scheme: brandScheme([c, ...rest]) })
    } else onChange({ color: c })
  }

  // ---- step 2: scheme ----
  const pickGenerated = (id: string) => onChange({ color_scheme: id })
  const pickBrand = () => {
    if (brand) return
    // Start from the base's palette, base first; otherwise just the base.
    const from = base ? palettes.find((p) => p.colors.includes(base)) : palettes[0]
    const list = from ? [...(base ? [base] : []), ...from.colors.filter((c) => c !== base)] : base ? [base] : []
    if (list.length) onChange({ color: list[0], color_scheme: brandScheme(list) })
  }
  const toggleBrand = (c: string) => {
    if (!brand) return
    const list = brand.colors.includes(c) ? brand.colors.filter((x) => x !== c) : [...brand.colors, c]
    if (!list.length) return
    onChange({ color: list[0], color_scheme: brandScheme(list) })
  }
  const wholePalette = (p: BrandPalette) => onChange({ color: p.colors[0], color_scheme: encodeBrand(p.name, p.colors) })

  const preview = (cs: string[]) => (
    <span className="cp-preview">{cs.map((c, i) => <i key={i} style={{ background: c, color: textOn(c) }}>{short(names[i] ?? '')}</i>)}</span>
  )

  return (
    <div className="color-pick" ref={box}>
      <button className="swatch-btn" title="Project colours" onClick={() => setOpen(!open)} style={{ background: accent }} aria-label="Project colours" />
      {open && (
        <div className="color-pop wide">
          <div className="cp-step"><b>1</b> Base colour <span className="muted">phase 1 uses it exactly</span></div>
          {palettes.length > 0 && (
            <div className="cp-brands">
              {palettes.map((p) => (
                <div key={p.id} className="cp-brand-row">
                  <span className="cp-brand-label" title={p.notes ?? p.name}>{p.name}</span>
                  <span className="cp-brand-chips">
                    {p.colors.map((c, i) => (
                      <button key={i} className={`cp-chip${base?.toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ background: c }}
                        title={`${c}: use as the base colour`} onClick={() => setBase(c)} />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="cp-presets">
            {ROOT_PRESETS.map((c) => (
              <button key={c.hex} title={c.name} className={base?.toLowerCase() === c.hex ? 'on' : ''}
                style={{ background: c.hex }} onClick={() => setBase(c.hex)} />
            ))}
          </div>
          <div className="cp-row">
            <label className="cp-custom">
              <input type="color" value={base ?? '#6b8f71'} onChange={(e) => setBase(e.target.value)} />
              Custom…
            </label>
            {base && <span className="mono small muted">{base}</span>}
          </div>

          <div className="cp-step"><b>2</b> Colour scheme</div>
          <div className="cp-schemes">
            {SCHEMES.map((s) => (
              <button key={s.id} className={`cp-scheme${generated === s.id ? ' on' : ''}`} onClick={() => pickGenerated(s.id)} title={s.hint} disabled={!base}>
                <span className="cp-scheme-name">{s.name}</span>
                {base && preview(projectPalette(base, names.length, s.id))}
              </button>
            ))}
            {palettes.length > 0 && (
              <button className={`cp-scheme${brand ? ' on' : ''}`} onClick={pickBrand}
                title="Pick brand colours by hand, in the order the phases should use them">
                <span className="cp-scheme-name">Brand colours{brand ? <span className="muted"> · {brand.name}</span> : ''}</span>
                {brand ? preview(projectPalette(null, names.length, scheme)) : <span className="muted small">Choose which brand colours, in order</span>}
              </button>
            )}
          </div>
          {!base && !brand && <p className="cp-hint">Pick a base colour first.</p>}
          {generated && base && <p className="cp-hint">{SCHEMES.find((s) => s.id === generated)?.hint}</p>}

          {brand && (
            <div className="cp-brand-pick">
              <p className="cp-hint">Click brand colours in the order the phases should use them (numbers show the order; click a numbered one to take it out). Phase 1 is also the base colour.</p>
              {palettes.map((p) => (
                <div key={p.id} className="cp-brand-row">
                  <button className="cp-brand-name" title={`Use all ${p.name} colours, in the palette's order`} onClick={() => wholePalette(p)}>{p.name}</button>
                  <span className="cp-brand-chips">
                    {p.colors.map((c, i) => {
                      const n = brand.colors.indexOf(c)
                      return (
                        <button key={i} className={`cp-chip${n >= 0 ? ' on' : ''}`} style={{ background: c, color: textOn(c) }}
                          title={n >= 0 ? `${c}: phase ${n + 1}. Click to take it out.` : `${c}: click to add`} onClick={() => toggleBrand(c)}>{n >= 0 ? n + 1 : ''}</button>
                      )
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
          {palettes.length === 0 && <p className="cp-hint">Save a client’s brand colours in Settings → Branding &amp; Printing to use them here.</p>}
        </div>
      )}
    </div>
  )
}
