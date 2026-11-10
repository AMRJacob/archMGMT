import { useSyncExternalStore } from 'react'

/**
 * Phone layout: narrow screens get their own navigation (top bar and bottom tabs) and simpler screens.
 * Same breakpoint as the CSS (@media (max-width: 720px)).
 */
export const PHONE_QUERY = '(max-width: 720px)'
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null
const subscribe = (cb: () => void) => { mq?.addEventListener('change', cb); return () => mq?.removeEventListener('change', cb) }
export const isPhone = () => Boolean(mq?.matches)
export const usePhone = () => useSyncExternalStore(subscribe, isPhone, () => false)

/**
 * Touch screens have no right-click: pressing and holding opens the same menu. Phones that already turn a
 * long press into a context menu (Android) are left alone; this covers the rest (iPhone).
 */
export function installLongPress() {
  if (typeof window === 'undefined' || !('ontouchstart' in window)) return
  let timer: ReturnType<typeof setTimeout> | null = null
  let start: { x: number; y: number; target: EventTarget | null } | null = null
  let fired = false
  const cancel = () => { if (timer) clearTimeout(timer); timer = null }
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { cancel(); return }
    const t = e.touches[0]
    const el = e.target as HTMLElement
    if (el.closest('input, textarea, select, [contenteditable="true"]')) return
    start = { x: t.clientX, y: t.clientY, target: e.target }
    fired = false
    cancel()
    timer = setTimeout(() => {
      if (!start) return
      fired = true
      start.target?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: start.x, clientY: start.y, button: 2 }))
      navigator.vibrate?.(10)
    }, 520)
  }, { passive: true })
  document.addEventListener('touchmove', (e) => {
    if (!start) return
    const t = e.touches[0]
    if (Math.abs(t.clientX - start.x) > 8 || Math.abs(t.clientY - start.y) > 8) cancel()
  }, { passive: true })
  document.addEventListener('touchend', (e) => { cancel(); if (fired) { e.preventDefault(); fired = false } })
  document.addEventListener('touchcancel', cancel)
  // A native long-press menu (Android) arrives too: let only one through.
  let last = 0
  document.addEventListener('contextmenu', (e) => {
    const now = Date.now()
    if (now - last < 600) { e.preventDefault(); e.stopImmediatePropagation(); return }
    last = now
  }, true)
}
