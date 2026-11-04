import { useEffect, useState, type RefObject } from 'react'
import Modal from './Modal.tsx'
import { EXPORT_BGS, EXPORT_PAGES, PAGE_MARGIN, pageOf, type ExportBg, type ExportFit, type ExportPage } from '../lib/exportLook.ts'

export interface ExportSettings { bg: ExportBg; page: ExportPage; fit: ExportFit }

/** The export drawing as an image URL (what the PNG and the preview are made from). */
export function svgUrl(el: SVGSVGElement): { url: string; w: number; h: number } {
  const [, , w, h] = el.getAttribute('viewBox')!.split(' ').map(Number)
  const markup = new XMLSerializer().serializeToString(el)
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup), w, h }
}

/**
 * The PNG: the drawing alone at 2× (fit to width), or the whole page (paper proportions, margin, background
 * colour) with the drawing scaled to fit on it.
 */
export async function renderPng(el: SVGSVGElement, s: ExportSettings, bgColor: string): Promise<Blob> {
  const { url, w, h } = svgUrl(el)
  const img = new Image()
  await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error('Could not draw the schedule')); img.src = url })
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  if (s.fit === 'fit') {
    const p = pageOf(s.page)
    const dpi = 200
    canvas.width = Math.round(p.w * dpi); canvas.height = Math.round(p.h * dpi)
    ctx.fillStyle = bgColor; ctx.fillRect(0, 0, canvas.width, canvas.height)
    const m = PAGE_MARGIN * dpi
    const k = Math.min((canvas.width - 2 * m) / w, (canvas.height - 2 * m) / h)
    ctx.drawImage(img, (canvas.width - w * k) / 2, (canvas.height - h * k) / 2, w * k, h * k)
  } else {
    const scale = 2
    canvas.width = w * scale; canvas.height = h * scale
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, w, h)
  }
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('Could not create the image')
  return blob
}

/** Preview of the PDF / PNG: pick paper, background and fit, see the pages, then export. */
export default function ExportPreview({ svg, settings, onSettings, bgColor, onClose, onPdf, onPng, saving }: {
  svg: RefObject<SVGSVGElement | null>
  settings: ExportSettings
  onSettings: (s: ExportSettings) => void
  bgColor: string
  onClose: () => void
  onPdf: () => void
  onPng: () => void
  saving: boolean
}) {
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null)
  // Re-read the drawing after every change (the hidden export chart re-renders with the new settings first).
  useEffect(() => {
    const id = requestAnimationFrame(() => { if (svg.current) setImg(svgUrl(svg.current)) })
    return () => cancelAnimationFrame(id)
  }, [svg, settings, bgColor])

  const p = pageOf(settings.page)
  const PW = 760 // preview paper width, px
  const ppi = PW / p.w
  const PH = p.h * ppi, m = PAGE_MARGIN * ppi
  const innerW = PW - 2 * m, innerH = PH - 2 * m
  // Fit to width: the drawing keeps the page's width and runs onto as many pages as it needs.
  const drawH = img ? (innerW * img.h) / img.w : 0
  const pages = settings.fit === 'fit' ? 1 : Math.max(1, Math.ceil(drawH / innerH - 0.01))
  const set = (c: Partial<ExportSettings>) => onSettings({ ...settings, ...c })

  return (
    <Modal title="Export preview" size="wide" onClose={onClose}
      footer={<>
        <span className="muted small grow">
          “Save as PDF” opens the print dialog: choose <strong>Save as PDF</strong> as the printer. Paper size and margins are already set.
        </span>
        <button className="btn" onClick={onPng} disabled={saving}>Download PNG</button>
        <button className="btn primary" onClick={onPdf}>Save as PDF</button>
      </>}>
      <div className="xp-controls">
        <label>Paper
          <select className="field boxed" value={settings.page} onChange={(e) => set({ page: e.target.value as ExportPage })}>
            {EXPORT_PAGES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <div className="xp-group">
          <span>Size</span>
          <div className="segmented small-seg">
            <button className={settings.fit === 'fit' ? 'on' : ''} onClick={() => set({ fit: 'fit' })}>Fit to one page</button>
            <button className={settings.fit === 'width' ? 'on' : ''} onClick={() => set({ fit: 'width' })}>Fit to width</button>
          </div>
        </div>
        <div className="xp-group">
          <span>Background</span>
          <div className="segmented small-seg">
            {EXPORT_BGS.map((b) => <button key={b.id} title={b.hint} className={settings.bg === b.id ? 'on' : ''} onClick={() => set({ bg: b.id })}>{b.name}</button>)}
          </div>
        </div>
      </div>
      <p className="muted small">
        {settings.fit === 'fit'
          ? 'The whole schedule is scaled down to fit one page.'
          : `Full width; ${pages === 1 ? 'fits on one page' : `runs onto ${pages} pages`}.`}
        {' '}The background is taken from the project’s colour (the dot next to its number on Overview).
      </p>
      <div className="xp-pages">
        {img && Array.from({ length: pages }, (_, i) => (
          <div key={i} className="xp-paper" style={{ width: PW, height: PH, background: bgColor, padding: m }}>
            <div className="xp-inner" style={{ width: innerW, height: innerH }}>
              {settings.fit === 'fit'
                ? <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }} />
                : <img src={img.url} alt="" style={{ width: innerW, height: drawH, marginTop: -i * innerH }} />}
            </div>
            {pages > 1 && <span className="xp-num">{i + 1} / {pages}</span>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
