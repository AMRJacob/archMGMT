import { useState } from 'react'
import { TextField } from './fields.tsx'
import { useRows } from '../lib/data.ts'
import type { BrandPalette } from '../lib/types.ts'

/**
 * Settings → Brand palettes: a client's brand colours (a campus or company standard), saved once and
 * picked in any project's colour picker. Phases use the colours in order.
 */
export default function BrandPalettes() {
  const palettes = useRows<BrandPalette>('brand_palettes')
  const [name, setName] = useState('')
  const sorted = [...palettes.rows].sort((a, b) => a.name.localeCompare(b.name))

  async function add() {
    const n = name.trim()
    if (!n) return
    await palettes.add({ name: n, colors: ['#4b2e83', '#b7a57a', '#85754e'], notes: null })
    setName('')
  }
  const setColors = (p: BrandPalette, colors: string[]) => void palettes.patch(p.id, { colors })

  return (
    <div className="card pad">
      <h2>Brand palettes</h2>
      <p className="muted">
        Save a school’s or company’s brand colours, then choose them in a project’s colour picker (the dot next to its number).
        Enter the hex values from the client’s brand guide; the first colour is the project’s main colour.
      </p>
      <ul className="brand-list">
        {sorted.map((p) => (
          <li key={p.id}>
            <TextField value={p.name} className="brand-name" onSave={(v) => v && palettes.patch(p.id, { name: v })} />
            <span className="brand-colors">
              {p.colors.map((c, i) => (
                <span key={i} className="brand-swatch">
                  <input type="color" value={c} title={c} onChange={(e) => setColors(p, p.colors.map((x, j) => (j === i ? e.target.value : x)))} />
                  {/* Typed hex codes apply when you leave the field (or press Enter), so partial codes don't fight you. */}
                  <input key={c} className="field mono hex" defaultValue={c} aria-label={`Colour ${i + 1}`}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    onBlur={(e) => {
                      let v = e.target.value.trim().toLowerCase()
                      if (/^[0-9a-f]{6}$/.test(v)) v = `#${v}`
                      if (/^#[0-9a-f]{6}$/.test(v) && v !== c) setColors(p, p.colors.map((x, j) => (j === i ? v : x)))
                      else e.target.value = c
                    }} />
                  {p.colors.length > 1 && <button className="icon-btn" title="Remove this colour" onClick={() => setColors(p, p.colors.filter((_, j) => j !== i))}>×</button>}
                </span>
              ))}
              {p.colors.length < 8 && <button className="btn ghost small-btn" onClick={() => setColors(p, [...p.colors, p.colors[p.colors.length - 1] ?? '#888888'])}>+ Colour</button>}
            </span>
            <TextField value={p.notes} placeholder="Notes (e.g. from the 2025 brand guide)" className="brand-notes" onSave={(v) => palettes.patch(p.id, { notes: v })} />
            <button className="icon-btn" title="Delete palette" onClick={() => { if (window.confirm(`Delete the ${p.name} palette? Projects using it keep their colours.`)) void palettes.drop(p.id) }}>×</button>
          </li>
        ))}
      </ul>
      <div className="row-gap">
        <input className="field boxed" placeholder="Client or campus name, e.g. UCA" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add() }} />
        <button className="btn" disabled={!name.trim()} onClick={() => void add()}>Add palette</button>
      </div>
    </div>
  )
}
