import { useSyncExternalStore } from 'react'
import { FIRM_NAME } from './brand.ts'

/**
 * The title block printed at the top of exported meeting notes. A placeholder for now: the basics are set in
 * Settings; the full title block creator from CAzen will replace this later.
 */
export interface TitleBlock { firm: string; address: string; phone: string; website: string; footer: string }

const KEY = 'archmgmt:title-block'
const EVENT = 'archmgmt:title-block'
const DEFAULT: TitleBlock = { firm: FIRM_NAME, address: 'Little Rock, Arkansas', phone: '', website: '', footer: 'These notes reflect the writer’s understanding of the meeting. Please send any corrections within 7 days.' }

let cache: { raw: string | null; v: TitleBlock } | null = null
export function getTitleBlock(): TitleBlock {
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { /* storage unavailable */ }
  if (cache?.raw === raw) return cache.v
  let v = DEFAULT
  try { if (raw) v = { ...DEFAULT, ...(JSON.parse(raw) as Partial<TitleBlock>) } } catch { /* keep default */ }
  cache = { raw, v }
  return v
}
export function setTitleBlock(v: TitleBlock) {
  try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVENT))
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}
export const useTitleBlock = () => useSyncExternalStore(subscribe, getTitleBlock, () => DEFAULT)
