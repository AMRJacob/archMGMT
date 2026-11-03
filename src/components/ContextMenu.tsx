import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuItem = 'sep' | { label: string; run: () => void; keys?: string; disabled?: boolean; danger?: boolean }

/** A right-click menu at the pointer. Closes on Escape, a click elsewhere, scrolling or picking an item. */
export default function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.min(x, window.innerWidth - r.width - 8)
    const top = y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height) : y
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measured placement must happen before paint
    if (left !== pos.left || top !== pos.top) setPos({ left, top })
  }, [x, y, pos.left, pos.top])

  useEffect(() => {
    const away = (e: Event) => { if (!box.current?.contains(e.target as Node)) onClose() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('contextmenu', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('resize', onClose)
    box.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('contextmenu', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div ref={box} className="ctx-menu" role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        e.preventDefault()
        const all = [...(box.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        const i = all.indexOf(document.activeElement as HTMLButtonElement)
        all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length]?.focus()
      }}>
      {items.map((it, i) => it === 'sep'
        ? <div key={i} className="pm-sep" />
        : (
          <button key={i} role="menuitem" className={`pm-item${it.danger ? ' danger' : ''}`} disabled={it.disabled}
            onClick={() => { onClose(); it.run() }}>
            <span>{it.label}</span>
            {it.keys && <span className="ctx-keys">{it.keys}</span>}
          </button>
        ))}
    </div>
  )
}
