import { useSyncExternalStore } from 'react'

/** The columns on the right of Overview rows. Their order, width and visibility are saved per browser. */
export type RowColumn = 'status' | 'size' | 'dates' | 'people'

export const ROW_COLUMNS: { key: RowColumn; label: string; width: number }[] = [
  { key: 'status', label: 'Status', width: 108 },
  { key: 'size', label: 'Size', width: 44 },
  { key: 'dates', label: 'Dates', width: 132 },
  { key: 'people', label: 'Who', width: 76 },
]

export interface RowLayout {
  order: RowColumn[]
  hidden: RowColumn[]
  widths: Partial<Record<RowColumn, number>>
  /** How wide rows are (px from their left edge); empty = the full width. Narrower pulls the columns toward the names. */
  span?: number | null
}

const KEY = 'archmgmt:row-columns'
const EVENT = 'archmgmt:row-columns'
const DEFAULT: RowLayout = { order: ROW_COLUMNS.map((c) => c.key), hidden: [], widths: {} }

let cache: { raw: string | null; value: RowLayout } | null = null
export function getRowLayout(): RowLayout {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { /* storage unavailable */ }
  if (cache && cache.raw === raw) return cache.value
  let value = DEFAULT
  try {
    const v = raw ? (JSON.parse(raw) as Partial<RowLayout>) : null
    if (v) {
      const known = new Set(ROW_COLUMNS.map((c) => c.key))
      const order = (v.order ?? []).filter((k) => known.has(k))
      for (const c of ROW_COLUMNS) if (!order.includes(c.key)) order.push(c.key)
      value = { order, hidden: (v.hidden ?? []).filter((k) => known.has(k)), widths: v.widths ?? {}, span: typeof v.span === 'number' ? v.span : null }
    }
  } catch { /* bad saved value: use the default */ }
  cache = { raw, value }
  return value
}

export function setRowLayout(v: RowLayout) {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT))
}

export const resetRowLayout = () => setRowLayout(DEFAULT)

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}

export const useRowLayout = () => useSyncExternalStore(subscribe, getRowLayout, () => DEFAULT)
/** Widths stay in a sensible range, so a stray drag can't push a column across the row. */
export const MIN_W = 40
export const MAX_W = 240
export const clampW = (w: number) => Math.max(MIN_W, Math.min(MAX_W, Math.round(w)))
export const widthOf = (l: RowLayout, k: RowColumn) => clampW(l.widths[k] ?? ROW_COLUMNS.find((c) => c.key === k)!.width)
