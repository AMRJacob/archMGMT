import { useState, type PointerEvent as RPointerEvent } from 'react'
import { Pop } from './TaskChips.tsx'
import { getRowLayout, resetRowLayout, ROW_COLUMNS, setRowLayout, useRowLayout, widthOf, type RowColumn } from '../lib/rowColumns.ts'

/**
 * Column headings over the Overview rows: drag a heading to move that column, drag its left edge to
 * resize it, and use Columns ▾ to hide or show one. Saved in this browser.
 */
export default function RowColumnsHeader() {
  const layout = useRowLayout()
  const [drag, setDrag] = useState<RowColumn | null>(null)
  const [drop, setDrop] = useState<{ key: RowColumn; side: 'l' | 'r' } | null>(null)
  const shown = layout.order.filter((k) => !layout.hidden.includes(k))
  const label = (k: RowColumn) => ROW_COLUMNS.find((c) => c.key === k)!.label

  const move = (from: RowColumn, to: RowColumn, side: 'l' | 'r') => {
    if (from === to) return
    const order = layout.order.filter((k) => k !== from)
    const i = order.indexOf(to) + (side === 'r' ? 1 : 0)
    setRowLayout({ ...layout, order: [...order.slice(0, i), from, ...order.slice(i)] })
  }
  // Columns sit at the right of the row, so their left edge is the one to drag.
  const resize = (k: RowColumn) => (e: RPointerEvent) => {
    e.preventDefault(); e.stopPropagation()
    const x0 = e.clientX, w0 = widthOf(layout, k)
    const mv = (ev: PointerEvent) => {
      const cur = getRowLayout()
      setRowLayout({ ...cur, widths: { ...cur.widths, [k]: Math.max(36, Math.round(w0 - (ev.clientX - x0))) } })
    }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true })
  }

  return (
    <div className="row-head">
      <Pop className="filter-pop" title="Show or hide columns" label={<span className="row-head-menu">Columns ▾</span>}>
        {() => (
          <>
            <div className="pm-label">Columns on the rows</div>
            {ROW_COLUMNS.map((c) => (
              <label key={c.key} className="pm-item check">
                <input type="checkbox" checked={!layout.hidden.includes(c.key)}
                  onChange={() => setRowLayout({ ...layout, hidden: layout.hidden.includes(c.key) ? layout.hidden.filter((x) => x !== c.key) : [...layout.hidden, c.key] })} />
                {c.label}
              </label>
            ))}
            <div className="pm-sep" />
            <button className="pm-item muted" onClick={resetRowLayout}>Reset order and widths</button>
          </>
        )}
      </Pop>
      <span className="grow" />
      {shown.map((k) => (
        <span key={k} draggable className={`rh-cell${drag === k ? ' dragging' : ''}${drop?.key === k ? ` drop-${drop.side}` : ''}`}
          style={{ width: widthOf(layout, k) }} title="Drag to move this column · drag the left edge to resize"
          onDragStart={(e) => { setDrag(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', label(k)) }}
          onDragOver={(e) => {
            if (!drag) return
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            const side = e.clientX < r.left + r.width / 2 ? 'l' : 'r'
            if (drop?.key !== k || drop.side !== side) setDrop({ key: k, side })
          }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null) }}
          onDrop={(e) => {
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            if (drag) move(drag, k, e.clientX < r.left + r.width / 2 ? 'l' : 'r')
            setDrag(null); setDrop(null)
          }}
          onDragEnd={() => { setDrag(null); setDrop(null) }}>
          <span className="rh-resize" onPointerDown={resize(k)} onDragStart={(e) => e.preventDefault()} />
          {label(k)}
        </span>
      ))}
      <span className="rh-more" />
    </div>
  )
}
