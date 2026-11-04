import { getPageWidth, setPageWidth } from '../lib/prefs.ts'

/**
 * The right edge of the page: drag it to set how wide pages are; double-click to switch between the full
 * window and a comfortable fitted width. Saved in this browser (also in Settings → Look).
 */
export default function PageEdge() {
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const main = (e.currentTarget.parentElement as HTMLElement)
    const left = main.getBoundingClientRect().left
    const max = window.innerWidth - left
    const move = (ev: PointerEvent) => {
      const w = Math.round(ev.clientX - left)
      setPageWidth(w >= max - 24 ? 'full' : Math.max(700, w))
    }
    document.body.classList.add('resizing-page')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', move); document.body.classList.remove('resizing-page') }, { once: true })
  }
  return (
    <div className="page-edge" title="Drag to set the page width · double-click to fit / fill the window"
      onPointerDown={start} onDoubleClick={() => setPageWidth(getPageWidth() === 'full' ? 'fit' : 'full')}>
      <span />
    </div>
  )
}
