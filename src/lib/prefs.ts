import { useSyncExternalStore } from 'react'

/** Small per-browser display preferences (Settings → Look). They never touch project data. */
export type TableText = 'wrap' | 'crop'

const KEY = 'archmgmt:table-text'
const EVENT = 'archmgmt:prefs'

export function getTableText(): TableText {
  try { return localStorage.getItem(KEY) === 'crop' ? 'crop' : 'wrap' } catch { return 'wrap' }
}

export function applyPrefs() {
  document.documentElement.dataset.tableText = getTableText()
}

export function setTableText(v: TableText) {
  try { localStorage.setItem(KEY, v) } catch { /* storage unavailable */ }
  applyPrefs()
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

export const useTableText = () => useSyncExternalStore(subscribe, getTableText, () => 'wrap' as TableText)

/** Page width: the whole window, a comfortable reading width, or a width dragged by hand (px). */
export type PageWidth = 'full' | 'fit' | number
const WIDTH_KEY = 'archmgmt:page-width'
export const FIT_WIDTH = 1320

export function getPageWidth(): PageWidth {
  try {
    const v = localStorage.getItem(WIDTH_KEY)
    if (v === 'fit') return 'fit'
    const n = Number(v)
    if (v && Number.isFinite(n) && n >= 700) return n
  } catch { /* storage unavailable */ }
  return 'full'
}
export function setPageWidth(v: PageWidth) {
  try { localStorage.setItem(WIDTH_KEY, String(v)) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT))
}
export const usePageWidth = () => useSyncExternalStore(subscribe, getPageWidth, () => 'full' as PageWidth)
