/**
 * Project colour schemes. Each project picks one root colour and a scheme. Phases get DIFFERENT hues
 * (so phases read apart at a glance), chosen to harmonise with the root, all at one soft lightness
 * and chroma so they sit together calmly. The first phase is always the root colour itself.
 *
 * Colour maths is done in OKLCH, where equal lightness looks equally light to the eye.
 */

export type SchemeId = 'balanced' | 'triad' | 'complementary'

export const SCHEMES: { id: SchemeId; name: string; hint: string }[] = [
  { id: 'balanced', name: 'Balanced', hint: 'Hues spread evenly around the wheel; neighbouring phases contrast.' },
  { id: 'triad', name: 'Triad', hint: 'Three hue families, each used at two depths.' },
  { id: 'complementary', name: 'Complementary', hint: 'The root and its opposite, with close neighbours of each.' },
]

/** Soft starting points to choose from (any colour can also be picked). */
export const ROOT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Sage', hex: '#6b8f71' },
  { name: 'Slate blue', hex: '#557a99' },
  { name: 'Teal', hex: '#4d8a86' },
  { name: 'Lavender', hex: '#8a77a8' },
  { name: 'Terracotta', hex: '#b8694a' },
  { name: 'Ochre', hex: '#b08a45' },
  { name: 'Clay rose', hex: '#a86f7a' },
  { name: 'Stone', hex: '#7d7468' },
]

/** The app's original phase colours, used when a project has no root colour yet. */
const DEFAULT = ['#8b9a96', '#6f8fa6', '#5f7a61', '#b5502d', '#c08a3e', '#4a5a78', '#8a6f9e', '#5a8a8a']

// ---------- sRGB ⇄ OKLCH ----------

interface LCH { l: number; c: number; h: number }

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0x6b8f71
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const toGamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

export function hexToOklch(hex: string): LCH {
  const [r, g, b] = hexToRgb(hex).map(toLinear)
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

function oklchToRgb({ l, c, h }: LCH): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

/** OKLCH to hex, easing chroma down until the colour fits in sRGB. */
export function oklchToHex(lch: LCH): string {
  let c = lch.c
  let rgb = oklchToRgb({ ...lch, c })
  while (rgb.some((v) => v < -0.0005 || v > 1.0005) && c > 0) { c -= 0.004; rgb = oklchToRgb({ ...lch, c: Math.max(0, c) }) }
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))) * 255).toString(16).padStart(2, '0')
  return `#${rgb.map(to).join('')}`
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** Yellows and olives look muddy at mid lightness; lift them a little (strongest around 95°). */
function yellowLift(h: number): number {
  const d = Math.abs((((h - 95) % 360) + 540) % 360 - 180)
  return d < 40 ? 0.07 * (1 - d / 40) : 0
}

// ---------- schemes ----------

/** Hue offsets (degrees from the root) for n phases, in phase order. */
function hueOffsets(scheme: SchemeId, n: number): { dh: number; depth: number }[] {
  if (scheme === 'triad') {
    const fam = [0, 120, 240]
    return Array.from({ length: n }, (_, i) => ({ dh: fam[i % 3] + (i >= 3 ? 12 : 0), depth: Math.floor(i / 3) }))
  }
  if (scheme === 'complementary') {
    const seq = [0, 180, 35, 215, -35, 145, 70, 250]
    return Array.from({ length: n }, (_, i) => ({ dh: seq[i % seq.length] + Math.floor(i / seq.length) * 15, depth: i % 2 }))
  }
  // balanced: evenly spaced hues, ordered so each phase sits far from the one before it
  const step = 360 / Math.max(n, 3)
  const half = Math.ceil(Math.max(n, 3) / 2)
  return Array.from({ length: n }, (_, i) => ({ dh: (i % 2 === 0 ? i / 2 : half + (i - 1) / 2) * step, depth: i % 2 }))
}

/** n phase colours from a root colour and scheme (or the default set when there's no root). */
/** A brand palette stored on a project as its scheme: "brand:Name|#aaa,#bbb,…". */
export function encodeBrand(name: string, colors: string[]) {
  return `brand:${name.replace(/[|]/g, '/')}|${colors.join(',')}`
}
export function decodeBrand(scheme: string | null | undefined): { name: string; colors: string[] } | null {
  if (!scheme?.startsWith('brand:')) return null
  const [name, list] = scheme.slice(6).split('|')
  const colors = (list ?? '').split(',').filter((c) => /^#[0-9a-f]{6}$/i.test(c))
  return colors.length ? { name, colors } : null
}

export function projectPalette(root: string | null | undefined, n: number, scheme?: string | null): string[] {
  const count = Math.max(1, n)
  // Brand colours are used exactly, in order. With more phases than colours, the extra phases take suggested
  // colours that go with the brand (the same ones the picker offers), then lighter / darker versions.
  const brand = decodeBrand(scheme)
  if (brand) {
    const filled = [...brand.colors, ...brandSuggestions(brand.colors, Math.max(0, count - brand.colors.length))]
    return Array.from({ length: count }, (_, i) => {
      if (i < filled.length) return filled[i]
      const c = filled[i % filled.length]
      const round = Math.floor(i / filled.length)
      const o = hexToOklch(c)
      return oklchToHex({ ...o, l: clamp(o.l + (round % 2 ? 0.14 : -0.12) * Math.ceil(round / 2), 0.25, 0.9) })
    })
  }
  if (!root) return Array.from({ length: count }, (_, i) => DEFAULT[i % DEFAULT.length])
  const base = hexToOklch(root)
  const id = (SCHEMES.some((s) => s.id === scheme) ? scheme : 'balanced') as SchemeId
  // One soft lightness and chroma for the whole set, taken from the root but kept in a calm range.
  const L = clamp(base.l, 0.56, 0.68)
  const C = clamp(base.c, 0.06, 0.1)
  return hueOffsets(id, count).map(({ dh, depth }, i) =>
    i === 0
      ? root.toLowerCase() // the base colour itself, exactly as chosen (a brand colour stays true)
      : oklchToHex({ l: L + (depth ? -0.07 : 0.02) + yellowLift(base.h + dh), c: C * (depth ? 0.95 : 1), h: base.h + dh }),
  )
}

/** The project's own accent and a pale tint of it (for chips and highlights). */
export function projectAccent(root: string | null | undefined) {
  if (!root) return { accent: '#b5502d', soft: '#f6e6df' }
  const b = hexToOklch(root)
  return {
    accent: oklchToHex({ l: clamp(b.l, 0.45, 0.58), c: clamp(b.c, 0.06, 0.12), h: b.h }),
    soft: oklchToHex({ l: 0.95, c: clamp(b.c * 0.35, 0.015, 0.035), h: b.h }),
  }
}

/** The dot that stands for a project (swatch, lists): its base colour exactly, or its first brand colour. */
export function projectDot(project: { color: string | null; color_scheme?: string | null } | null | undefined): string {
  return project?.color ?? decodeBrand(project?.color_scheme)?.colors[0] ?? projectAccent(null).accent
}

/** Dark or light text, whichever reads better on a colour. */
export function textOn(hex: string): string {
  return hexToOklch(hex).l > 0.72 ? '#1c1f23' : '#ffffff'
}

/**
 * Each phase's colour. A phase keeps the palette slot it was given (color_slot), so reordering phases
 * doesn't repaint them; phases without one take the free slots in phase order.
 */
export function phaseSlots(phases: { id: string; sort_order: number; start_date: string; color_slot?: number | null }[]): Map<string, number> {
  const sorted = [...phases].sort((a, b) => a.sort_order - b.sort_order || a.start_date.localeCompare(b.start_date))
  const slots = new Map<string, number>()
  const used = new Set<number>()
  for (const p of sorted) if (p.color_slot != null && !used.has(p.color_slot)) { slots.set(p.id, p.color_slot); used.add(p.color_slot) }
  let next = 0
  for (const p of sorted) {
    if (slots.has(p.id)) continue
    while (used.has(next)) next++
    slots.set(p.id, next); used.add(next)
  }
  return slots
}

export function phaseColors(
  project: { color: string | null; color_scheme?: string | null },
  phases: { id: string; sort_order: number; start_date: string; color_slot?: number | null }[],
): Map<string, string> {
  const slots = phaseSlots(phases)
  const n = Math.max(phases.length, ...[...slots.values()].map((s) => s + 1))
  const pal = projectPalette(project.color, n, project.color_scheme)
  return new Map([...slots].map(([id, s]) => [id, pal[s]]))
}

/**
 * Colours that go with a set of brand colours, for brands with too few to colour every phase: a lighter and a
 * deeper version of each brand colour, then hues that sit between them on the colour wheel. Never repeats a colour
 * already in the set.
 */
export function brandSuggestions(colors: string[], count = 10): string[] {
  const have = new Set(colors.map((c) => c.toLowerCase()))
  const out: string[] = []
  const add = (h: string) => { const k = h.toLowerCase(); if (!have.has(k) && !out.includes(k)) out.push(k) }
  const vivid = colors.map(hexToOklch).filter((o) => o.c > 0.03)
  for (const o of vivid) {
    add(oklchToHex({ ...o, l: clamp(o.l + 0.18, 0.55, 0.88), c: o.c * 0.75 }))
    add(oklchToHex({ ...o, l: clamp(o.l - 0.14, 0.25, 0.6) }))
  }
  if (vivid.length) {
    const L = vivid.reduce((s, o) => s + o.l, 0) / vivid.length, C = Math.min(0.14, vivid.reduce((s, o) => s + o.c, 0) / vivid.length)
    const hues = vivid.map((o) => o.h).sort((a, b) => a - b)
    // Midpoints between neighbouring brand hues (wrapping round), then a few evenly spaced from the first.
    hues.forEach((h, i) => { const nx = hues[(i + 1) % hues.length] + (i + 1 === hues.length ? 360 : 0); add(oklchToHex({ l: clamp(L, 0.5, 0.7), c: C, h: (h + nx) / 2 })) })
    for (const dh of [60, 150, 210, 300]) add(oklchToHex({ l: clamp(L, 0.5, 0.7), c: C * 0.85, h: hues[0] + dh }))
  } else {
    for (const h of [30, 150, 250, 330]) add(oklchToHex({ l: 0.62, c: 0.08, h }))
  }
  return out.slice(0, count)
}
