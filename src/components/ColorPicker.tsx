import { useEffect, useRef, useState } from 'react'
import { brandSuggestions, decodeBrand, encodeBrand, phaseSlots, projectDot, projectPalette, ROOT_PRESETS, SCHEMES, textOn } from '../lib/colors.ts'
import { useRows } from '../lib/data.ts'
import type { BrandPalette, Phase } from '../lib/types.ts'

/**
 * A project's colours, in two steps:
 *  1. Base colour: any saved brand colour, a preset or a custom colour. Phase 1 uses it exactly.
 *  2. Scheme: Balanced / Triad / Complementary build the other phases from the base, or "Brand colours" uses
 *     brand colours you pick by hand, in order (from one palette or several).
 * Both are saved together in one change (color + color_scheme).
 */
export default function ColorPicker({ value, scheme, phases, onChange }: {
  value: string | null
  scheme: string | null
  /** The project's phases: each keeps its colour slot, so previews show the colour it really gets. */
  phases: Pick<Phase, 'id' | 'name' | 'sort_order' | 'start_date' | 'color_slot'>[]
  onChange: (c: { color?: string | null; color_scheme?: string | null }) => void
}) {
  const [open, setOpen] = useState(false)
  const [dragAt, setDragAt] = useState<number | null>(null)
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

  const short = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase()
  // Phases in order, each with the palette slot it keeps (a phase added later keeps a later slot).
  const ordered = phases.length
    ? [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))
    : Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `Phase ${i + 1}`, sort_order: i, start_date: '', color_slot: i }))
  const slots = phaseSlots(ordered)
  const slotCount = Math.max(ordered.length, ...[...slots.values()].map((x) => x + 1))
  const phaseInSlot = (i: number) => ordered.find((p) => slots.get(p.id) === i)
  const base = value ?? null
  const swatch = projectDot({ color: base, color_scheme: scheme })
  const generated = brand ? null : (scheme ?? 'balanced')

  /** The palette a colour belongs to (for naming a hand-picked set). */
  const paletteWith = (cs: string[]) => palettes.find((p) => cs.every((c) => p.colors.includes(c))) ?? palettes.find((p) => cs.some((c) => p.colors.includes(c)))
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
  // One colour for every phase slot: the chosen brand colours, then suggested ones (dashed) for the rest.
  const full = brand ? projectPalette(null, Math.max(slotCount, brand.colors.length), scheme) : []
  /** Phase order: drag a colour to a new place (phase 1 is also the base colour). Saves the whole list. */
  const moveBrand = (from: number, to: number) => {
    if (!brand || from === to) return
    const list = [...full]
    const [c] = list.splice(from, 1)
    list.splice(to, 0, c)
    onChange({ color: list[0], color_scheme: brandScheme(list) })
  }
  /** Add a colour: it takes the first slot that only had a suggested colour, or goes on the end. */
  const addColor = (c: string) => {
    if (!brand || brand.colors.includes(c)) return
    const list = [...brand.colors, c]
    onChange({ color: list[0], color_scheme: brandScheme(list) })
  }
  /** Take a chosen colour out; a suggested colour fills that phase until another is picked. */
  const removeAt = (i: number) => {
    if (!brand || brand.colors.length < 2) return
    const list = brand.colors.filter((_, j) => j !== i)
    onChange({ color: list[0], color_scheme: brandScheme(list) })
  }
  const wholePalette = (p: BrandPalette) => onChange({ color: p.colors[0], color_scheme: encodeBrand(p.name, p.colors) })

  /** A scheme's colours on the actual phases, in phase order. */
  const preview = (pal: string[]) => (
    <span className="cp-preview">{ordered.map((p) => { const c = pal[slots.get(p.id) ?? 0]; return <i key={p.id} style={{ background: c, color: textOn(c) }} title={p.name}>{short(p.name)}</i> })}</span>
  )

  return (
    <div className="color-pick" ref={box}>
      <button className="swatch-btn" title="Project colours" onClick={() => setOpen(!open)} style={{ background: swatch }} aria-label="Project colours" />
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
                {base && preview(projectPalette(base, slotCount, s.id))}
              </button>
            ))}
            {palettes.length > 0 && (
              <button className={`cp-scheme${brand ? ' on' : ''}`} onClick={pickBrand}
                title="Pick brand colours by hand, in the order the phases should use them">
                <span className="cp-scheme-name">Brand colours{brand ? <span className="muted"> · {brand.name}</span> : ''}</span>
                {brand ? preview(projectPalette(null, slotCount, scheme)) : <span className="muted small">Choose which brand colours, in order</span>}
              </button>
            )}
          </div>
          {!base && !brand && <p className="cp-hint">Pick a base colour first.</p>}
          {generated && base && <p className="cp-hint">{SCHEMES.find((s) => s.id === generated)?.hint}</p>}

          {brand && (
            <div className="cp-brand-pick">
              <div className="cp-label">Phase order <span className="cp-label-note">· drag to reorder</span></div>
              <div className="cp-order">
                {full.map((c, i) => {
                  const ph = phaseInSlot(i), picked = i < brand.colors.length
                  return (
                    <span key={`${i}-${c}`} className={`cp-order-chip${dragAt === i ? ' dragging' : ''}${picked ? '' : ' suggested'}`} draggable
                      title={`${ph ? ph.name : `Slot ${i + 1}`}: ${c}${picked ? '' : ' (suggested; drag or click a colour below to change)'}. Drag to reorder.`}
                      style={{ background: c, color: textOn(c) }}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDragAt(i) }}
                      onDragOver={(e) => { if (dragAt !== null) e.preventDefault() }}
                      onDrop={(e) => { e.preventDefault(); if (dragAt !== null) moveBrand(dragAt, i); setDragAt(null) }}
                      onDragEnd={() => setDragAt(null)}>
                      <b>{ph ? short(ph.name) : i + 1}</b>
                      {picked && brand.colors.length > 1 && <button title="Take this colour out" onClick={() => removeAt(i)}>×</button>}
                    </span>
                  )
                })}
              </div>
              <p className="cp-hint">Each chip is a phase (labels show which). Dashed chips are suggested colours filling phases the brand doesn’t cover: drag colours to swap them, or click a brand or suggested colour below to add it. The first is also the base colour.</p>
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
              <div className="cp-brand-row">
                <span className="cp-brand-label muted" title="Colours that go with the brand, for brands without enough colours">Suggested</span>
                <span className="cp-brand-chips">
                  {brandSuggestions(brand.colors).map((c) => (
                    <button key={c} className="cp-chip suggest" style={{ background: c }} title={`${c}: add after the brand colours`} onClick={() => addColor(c)} />
                  ))}
                </span>
              </div>
            </div>
          )}
          {palettes.length === 0 && <p className="cp-hint">Save a client’s brand colours in Settings → Branding &amp; Printing to use them here.</p>}
        </div>
      )}
    </div>
  )
}
