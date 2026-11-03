import { useSyncExternalStore } from 'react'

/** Looks for the app. The choice is saved per browser; it never touches project data. */
export type ThemeId = 'studio' | 'midcentury' | 'blueprint' | 'cyberpunk'

export interface ThemeInfo {
  id: ThemeId
  name: string
  blurb: string
  /** Swatches for the picker: sidebar, paper, accent, two extras. */
  swatch: [string, string, string, string, string]
}

export const THEMES: ThemeInfo[] = [
  { id: 'studio', name: 'Studio', blurb: 'The original: warm paper, slate sidebar, terracotta accent.', swatch: ['#1f2a2e', '#f7f6f2', '#b5502d', '#2f6690', '#2f7d5b'] },
  { id: 'midcentury', name: 'Mid-century', blurb: 'Cream stock, teal, mustard and tangerine, geometric type.', swatch: ['#1e4a4f', '#f2e8d5', '#d9572b', '#e3a72f', '#3f8f88'] },
  { id: 'blueprint', name: 'Blueprint', blurb: 'Cyanotype blue with drafting-grid lines and hand lettering.', swatch: ['#0f2a4a', '#e9f0f7', '#1f6fd1', '#f2c14e', '#5aa9e6'] },
  { id: 'cyberpunk', name: 'Cyberpunk', blurb: 'Night mode in neon: magenta, cyan and acid yellow.', swatch: ['#06070d', '#0c0e1a', '#ff2e88', '#00e5ff', '#e8ff3a'] },
]

const KEY = 'archmgmt:theme'
const EVENT = 'archmgmt:theme'

export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY)
    if (THEMES.some((t) => t.id === v)) return v as ThemeId
  } catch { /* storage unavailable */ }
  return 'studio'
}

export function applyTheme(id: ThemeId = getTheme()) {
  document.documentElement.dataset.theme = id
}

export function setTheme(id: ThemeId) {
  try { localStorage.setItem(KEY, id) } catch { /* storage unavailable */ }
  applyTheme(id)
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, getTheme, () => 'studio')
}

/** Colors the on-screen schedule chart draws with. Exports always use STUDIO_CHART, so presentations look the same whatever theme you work in. */
export interface ChartColors {
  bg: string
  band: string
  ink: string
  muted: string
  line: string
  lineStrong: string
  lineFaint: string
  faint: string
  accent: string
  onAccent: string
  font: string
}

const BASE_FONT = "Inter, 'Segoe UI', Helvetica, Arial, sans-serif"

export const STUDIO_CHART: ChartColors = {
  bg: '#ffffff', band: '#f8f7f3', ink: '#1c1f23', muted: '#6b7178', line: '#e7e4de',
  lineStrong: '#d6d2ca', lineFaint: '#f0eee9', faint: '#bcb9b2', accent: '#b5502d', onAccent: '#ffffff', font: BASE_FONT,
}

const CHART: Record<ThemeId, ChartColors> = {
  studio: STUDIO_CHART,
  midcentury: {
    bg: '#fbf6ea', band: '#f2e8d5', ink: '#2b2520', muted: '#7a6c5d', line: '#e6dac3',
    lineStrong: '#d4c4a6', lineFaint: '#eee4d0', faint: '#bfae92', accent: '#d9572b', onAccent: '#ffffff', font: "Jost, 'Futura', " + BASE_FONT,
  },
  blueprint: {
    bg: '#123561', band: '#0f2d54', ink: '#f2f7ff', muted: '#a9c2e0', line: '#2a5288',
    lineStrong: '#3d6aa6', lineFaint: '#1c416f', faint: '#5f82ad', accent: '#f2c14e', onAccent: '#0f2a4a', font: BASE_FONT,
  },
  cyberpunk: {
    bg: '#0c0e1a', band: '#11142a', ink: '#e8ebff', muted: '#8a90c0', line: '#232850',
    lineStrong: '#343b72', lineFaint: '#181c3a', faint: '#4d5488', accent: '#ff2e88', onAccent: '#06070d', font: "'Chakra Petch', " + BASE_FONT,
  },
}

export function chartColors(id: ThemeId): ChartColors {
  return CHART[id]
}
