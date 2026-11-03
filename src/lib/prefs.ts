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
