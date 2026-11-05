import { decodeBrand, encodeBrand, hexToOklch, oklchToHex, projectAccent, textOn } from './colors.ts'
import { STUDIO_CHART, type ChartColors } from './theme.ts'
import type { BrandPalette, BrandRoles, Project } from './types.ts'

/** How a schedule export looks on the page: paper size, background, and whether it's squeezed onto one page. */
export type ExportBg = 'white' | 'tint' | 'dark' | 'brand' | 'custom'
export type ExportPage = 'letter' | 'tabloid' | 'arch-b'
export type ExportFit = 'fit' | 'width'

export const EXPORT_BGS: { id: ExportBg; name: string; hint: string }[] = [
  { id: 'white', name: 'White', hint: 'Plain white page.' },
  { id: 'tint', name: 'Brand tint', hint: 'A light wash of the project’s main colour.' },
  { id: 'dark', name: 'Brand dark', hint: 'A deep shade of the project’s main colour, with light text.' },
  { id: 'custom', name: 'Custom', hint: 'Your own background, cell, heading and text colours for this project.' },
  { id: 'brand', name: 'Brand palette', hint: 'Only the brand’s own colours, placed as set in Settings → Branding & Printing.' },
]
export const EXPORT_PAGES: { id: ExportPage; name: string; w: number; h: number }[] = [
  { id: 'letter', name: 'Letter (11 × 8.5)', w: 11, h: 8.5 },
  { id: 'tabloid', name: 'Tabloid (17 × 11)', w: 17, h: 11 },
  { id: 'arch-b', name: 'Arch B (18 × 12)', w: 18, h: 12 },
]
/** Margin round the drawing, in inches (the background colour runs to the paper's edge). */
export const PAGE_MARGIN = 0.35

export const pageOf = (id: ExportPage) => EXPORT_PAGES.find((p) => p.id === id) ?? EXPORT_PAGES[0]

/** The main colour a project's exports are tinted with: its root colour, else its brand's first colour. */
function rootOf(project: Project): string | null {
  return project.color ?? decodeBrand(project.color_scheme)?.colors[0] ?? null
}

/** The saved brand palette a project's colours come from (by name, else the one holding its main colour). */
export function paletteOf(project: Project, palettes: BrandPalette[]): BrandPalette | null {
  const b = decodeBrand(project.color_scheme)
  if (!b) return null
  return palettes.find((p) => p.name === b.name) ?? palettes.find((p) => p.colors.includes(b.colors[0])) ?? null
}

/** For "Brand palette": phases cycle through the brand colours exactly (no lighter or darker versions). */
export function brandOnlyProject(project: Project): Project {
  const b = decodeBrand(project.color_scheme)
  if (!b) return project
  const many = Array.from({ length: 24 }, (_, i) => b.colors[i % b.colors.length])
  return { ...project, color_scheme: encodeBrand(b.name, many) }
}

const hexMix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** Chart colours from chosen parts (background, cells, headings & accent, text); the rest worked out to match. */
function fromRoles(r: BrandRoles, colors: string[]): ChartColors {
  const back = r.background ?? '#ffffff'
  const dark = textOn(back) === '#ffffff'
  const ink = r.text ?? (dark ? '#f4f5f7' : '#1c1f23')
  // Auto accent: the colour that stands out most from the background.
  const lum = (h: string) => hexToOklch(h).l
  const accent = r.accent ?? [...colors].sort((a, b) => Math.abs(lum(b) - lum(back)) - Math.abs(lum(a) - lum(back)))[0] ?? STUDIO_CHART.accent
  const band = r.band ?? hexMix(back, colors[0] ?? ink, 0.09)
  return {
    ...STUDIO_CHART, bg: back, band, ink, accent, onAccent: textOn(accent),
    muted: hexMix(ink, back, 0.32), faint: hexMix(ink, back, 0.6),
    line: hexMix(back, ink, 0.12), lineStrong: hexMix(back, ink, 0.2), lineFaint: hexMix(back, ink, 0.06),
  }
}

/** Chart colours for an export background. White is the standard presentation look. */
export function exportColors(project: Project, bg: ExportBg, palette?: BrandPalette | null): ChartColors {
  const root = rootOf(project)
  if (bg === 'brand' || bg === 'custom') {
    // Brand palette: only brand colours, placed as set in Branding. Custom: this project's own choices.
    const colors = decodeBrand(project.color_scheme)?.colors ?? palette?.colors ?? (root ? [root] : [])
    return fromRoles(bg === 'custom' ? project.export_colors ?? {} : palette?.roles ?? {}, colors)
  }
  if (bg === 'white' || !root) return bg === 'dark' && !root ? DARK_NEUTRAL : STUDIO_CHART
  const b = hexToOklch(root)
  const c = (l: number, chroma: number) => oklchToHex({ l, c: chroma, h: b.h })
  const k = Math.min(b.c, 0.12)
  if (bg === 'tint') {
    return {
      ...STUDIO_CHART,
      bg: c(0.975, k * 0.18), band: c(0.945, k * 0.3), line: c(0.9, k * 0.3), lineStrong: c(0.84, k * 0.35),
      lineFaint: c(0.93, k * 0.25), faint: c(0.75, k * 0.3), accent: projectAccent(root).accent,
    }
  }
  return {
    ...STUDIO_CHART,
    bg: c(0.24, k * 0.55), band: c(0.29, k * 0.6), ink: '#f4f5f7', muted: c(0.78, k * 0.25), line: c(0.36, k * 0.5),
    lineStrong: c(0.44, k * 0.5), lineFaint: c(0.31, k * 0.5), faint: c(0.6, k * 0.35), accent: c(0.82, Math.min(0.12, b.c)),
    onAccent: c(0.22, k * 0.5),
  }
}

const DARK_NEUTRAL: ChartColors = {
  ...STUDIO_CHART, bg: '#1f2328', band: '#272c32', ink: '#f4f5f7', muted: '#a7adb5', line: '#353b42',
  lineStrong: '#46505a', lineFaint: '#2b3036', faint: '#6b737c', accent: '#e8a184', onAccent: '#1f2328',
}
