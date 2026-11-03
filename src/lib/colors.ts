/**
 * Project colour schemes. Each project picks one root colour; its phases get a calm palette built
 * from it: neighbouring hues (a gentle analogous spread), saturation kept soft, and lightness moving
 * from lighter early phases to deeper later ones.
 */

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

interface HSL { h: number; s: number; l: number }

export function hexToHsl(hex: string): HSL {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0x6b8f71
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  return { h, s, l }
}

export function hslToHex({ h, s, l }: HSL): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** n phase colours from a root colour (or the default set when there's no root). */
export function projectPalette(root: string | null | undefined, n: number): string[] {
  const count = Math.max(1, n)
  if (!root) return Array.from({ length: count }, (_, i) => DEFAULT[i % DEFAULT.length])
  const base = hexToHsl(root)
  const s = clamp(base.s, 0.2, 0.46)
  const spread = count <= 3 ? 24 : 40 // total hue range across all phases, in degrees
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1)
    return hslToHex({
      h: base.h + (t - 0.5) * spread,
      s: clamp(s * (0.85 + 0.3 * t), 0.16, 0.5),
      l: clamp(0.62 - 0.24 * t, 0.34, 0.66),
    })
  })
}

/** The project's own accent and a pale tint of it (for chips and highlights). */
export function projectAccent(root: string | null | undefined) {
  if (!root) return { accent: '#b5502d', soft: '#f6e6df' }
  const b = hexToHsl(root)
  return {
    accent: hslToHex({ h: b.h, s: clamp(b.s, 0.25, 0.5), l: clamp(b.l, 0.36, 0.48) }),
    soft: hslToHex({ h: b.h, s: clamp(b.s * 0.6, 0.15, 0.35), l: 0.93 }),
  }
}

/** Dark or light text, whichever reads better on a colour. */
export function textOn(hex: string): string {
  return hexToHsl(hex).l > 0.6 ? '#1c1f23' : '#ffffff'
}
