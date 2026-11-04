import { useState } from 'react'
import { TextField } from './fields.tsx'
import { useRows } from '../lib/data.ts'
import { supabase } from '../lib/supabase.ts'
import type { BrandPalette } from '../lib/types.ts'

interface SiteColors { title: string; colors: string[]; neutrals: string[] }

/** Ask the site-colors function for the colours a website uses. */
async function readSite(url: string): Promise<SiteColors> {
  if (!supabase) throw new Error('Reading a website needs the shared database.')
  const { data, error } = await supabase.functions.invoke('site-colors', { body: { url } })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* keep msg */ }
    throw new Error(msg)
  }
  return data as SiteColors
}

const move = <T,>(xs: T[], from: number, to: number) => { const a = [...xs]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a }

/**
 * From a website: paste a link, see the colours the site uses, click them in the order you want them
 * (first = the project's main colour), then save as a new palette or add to an existing one.
 */
function FromWebsite({ palettes, onCreate, onAppend }: {
  palettes: BrandPalette[]
  onCreate: (name: string, colors: string[], notes: string) => void
  onAppend: (p: BrandPalette, colors: string[]) => void
}) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [found, setFound] = useState<SiteColors & { url: string } | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')

  async function read() {
    const u = url.trim()
    if (!u) return
    setBusy(true); setError(null)
    try {
      const r = await readSite(u)
      if (!r.colors.length && !r.neutrals.length) throw new Error('No colours found on that page. Try the site’s home page, or enter the hex codes by hand.')
      setFound({ ...r, url: u })
      setPicked(r.colors.slice(0, 4))
      let host = u; try { host = new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '') } catch { /* keep */ }
      setName(r.title.split(/\s[|–—-]\s/)[0]?.trim() || host)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  const toggle = (c: string) => setPicked(picked.includes(c) ? picked.filter((x) => x !== c) : picked.length < 8 ? [...picked, c] : picked)
  const close = () => { setFound(null); setPicked([]); setUrl(''); setTarget('') }
  const appendTo = palettes.find((p) => p.id === target)

  return (
    <div className="brand-web">
      <div className="row-gap">
        <input className="field boxed" placeholder="Or paste a website, e.g. uca.edu" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void read() }} />
        <button className="btn" disabled={!url.trim() || busy} onClick={() => void read()}>{busy ? 'Reading…' : 'Get colours'}</button>
      </div>
      {error && <p className="error small">{error}</p>}
      {found && (
        <div className="brand-found">
          <p className="muted small">
            Colours used on <strong>{found.url}</strong>, most-used first. Click them in the order you want; the first is the main colour.
            You can change, remove or reorder them after saving too.
          </p>
          {[['Brand colours', found.colors], ['Neutrals', found.neutrals]].map(([label, list]) => (list as string[]).length > 0 && (
            <div key={label as string} className="brand-found-row">
              <span className="muted small">{label as string}</span>
              {(list as string[]).map((c) => {
                const n = picked.indexOf(c)
                return (
                  <button key={c} className={`brand-chip${n >= 0 ? ' on' : ''}`} title={c} style={{ background: c }} onClick={() => toggle(c)}>
                    {n >= 0 && <b>{n + 1}</b>}
                  </button>
                )
              })}
            </div>
          ))}
          <div className="brand-found-row">
            <span className="muted small">Your palette</span>
            {picked.length === 0 && <span className="muted small">Click colours above.</span>}
            {picked.map((c, i) => (
              <span key={c} className="brand-swatch">
                <i className="brand-dot" style={{ background: c }} /> <span className="mono small">{c}</span>
                {i > 0 && <button className="icon-btn" title="Move left" onClick={() => setPicked(move(picked, i, i - 1))}>‹</button>}
                {i < picked.length - 1 && <button className="icon-btn" title="Move right" onClick={() => setPicked(move(picked, i, i + 1))}>›</button>}
                <button className="icon-btn" title="Remove" onClick={() => setPicked(picked.filter((x) => x !== c))}>×</button>
              </span>
            ))}
          </div>
          <div className="row-gap">
            <select className="field boxed" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Save to">
              <option value="">New palette</option>
              {palettes.map((p) => <option key={p.id} value={p.id}>Add to {p.name}</option>)}
            </select>
            {!appendTo && <input className="field boxed" placeholder="Palette name" value={name} onChange={(e) => setName(e.target.value)} />}
            <button className="btn primary" disabled={!picked.length || (!appendTo && !name.trim())}
              onClick={() => {
                if (appendTo) onAppend(appendTo, picked)
                else onCreate(name.trim(), picked, `From ${found.url}`)
                close()
              }}>{appendTo ? 'Add colours' : 'Save palette'}</button>
            <button className="btn ghost" onClick={close}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

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
  const [drag, setDrag] = useState<{ id: string; i: number } | null>(null)

  return (
    <div className="card pad">
      <h2>Brand palettes</h2>
      <p className="muted">
        Save a school’s or company’s brand colours, then choose them in a project’s colour picker (the dot next to its number).
        Enter the hex values from the client’s brand guide, or pull them from the client’s website. The first colour is the
        project’s main colour; drag a colour by its handle to reorder.
      </p>
      <ul className="brand-list">
        {sorted.map((p) => (
          <li key={p.id}>
            <TextField value={p.name} className="brand-name" onSave={(v) => v && palettes.patch(p.id, { name: v })} />
            <span className="brand-colors">
              {p.colors.map((c, i) => (
                <span key={i} className={`brand-swatch${drag?.id === p.id && drag.i === i ? ' dragging' : ''}`}
                  onDragOver={(e) => { if (drag?.id === p.id) e.preventDefault() }}
                  onDrop={(e) => { e.preventDefault(); if (drag?.id === p.id && drag.i !== i) setColors(p, move(p.colors, drag.i, i)); setDrag(null) }}>
                  {p.colors.length > 1 && <span className="brand-grip" draggable title="Drag to reorder"
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDrag({ id: p.id, i }) }}
                    onDragEnd={() => setDrag(null)}>⋮⋮</span>}
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
      {supabase && (
        <FromWebsite palettes={sorted}
          onCreate={(n, colors, notes) => void palettes.add({ name: n, colors, notes })}
          onAppend={(p, colors) => setColors(p, [...p.colors, ...colors.filter((c) => !p.colors.includes(c))].slice(0, 8))} />
      )}
    </div>
  )
}
