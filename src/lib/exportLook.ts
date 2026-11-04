import { decodeBrand, hexToOklch, oklchToHex, projectAccent } from './colors.ts'
import { STUDIO_CHART, type ChartColors } from './theme.ts'
import type { Project } from './types.ts'

/** How a schedule export looks on the page: paper size, background, and whether it's squeezed onto one page. */
export type ExportBg = 'white' | 'tint' | 'dark'
export type ExportPage = 'letter' | 'tabloid'
export type ExportFit = 'fit' | 'width'

export const EXPORT_BGS: { id: ExportBg; name: string; hint: string }[] = [
  { id: 'white', name: 'White', hint: 'Plain white page.' },
  { id: 'tint', name: 'Brand tint', hint: 'A light wash of the project’s main colour.' },
  { id: 'dark', name: 'Brand dark', hint: 'A deep shade of the project’s main colour, with light text.' },
]
export const EXPORT_PAGES: { id: ExportPage; name: string; w: number; h: number }[] = [
  { id: 'letter', name: 'Letter (11 × 8.5)', w: 11, h: 8.5 },
  { id: 'tabloid', name: 'Tabloid (17 × 11)', w: 17, h: 11 },
]
/** Margin round the drawing, in inches (the background colour runs to the paper's edge). */
export const PAGE_MARGIN = 0.35

export const pageOf = (id: ExportPage) => EXPORT_PAGES.find((p) => p.id === id) ?? EXPORT_PAGES[0]

/** The main colour a project's exports are tinted with: its root colour, else its brand's first colour. */
function rootOf(project: Project): string | null {
  return project.color ?? decodeBrand(project.color_scheme)?.colors[0] ?? null
}

/** Chart colours for an export background. White is the standard presentation look. */
export function exportColors(project: Project, bg: ExportBg): ChartColors {
  const root = rootOf(project)
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
