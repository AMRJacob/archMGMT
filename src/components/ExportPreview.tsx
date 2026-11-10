import { useEffect, useState, type ReactNode } from 'react'
import Modal from './Modal.tsx'
import { EXPORT_W } from './ScheduleChart.tsx'
import { EXPORT_BGS, EXPORT_PAGES, PAGE_MARGIN, pageOf, type ExportBg, type ExportFit, type ExportPage, type ExportRange } from '../lib/exportLook.ts'

export interface ExportSettings { bg: ExportBg; page: ExportPage; fit: ExportFit; range: ExportRange }

/** The whole schedule split into pages at the screen's zoom: how many pages across, and where they break. */
export interface ExportPages {
  count: number
  /** Where each page after the first starts, across the long strip drawing (chart units). */
  breaks: number[]
  /** The span each page covers, e.g. "6 months". */
  span: string
}

/** The export drawing as an image URL (what the PNG and the preview are made from). */
export function svgUrl(el: SVGSVGElement): { url: string; w: number; h: number } {
  const [, , w, h] = el.getAttribute('viewBox')!.split(' ').map(Number)
  const markup = new XMLSerializer().serializeToString(el)
  return { url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup), w, h }
}

/**
 * The PNG: the drawing alone at up to 2× (fit to width), or the whole page (paper proportions, margin, background
 * colour) with the drawing scaled to fit on it.
 */
export async function renderPng(el: SVGSVGElement, s: Pick<ExportSettings, 'page' | 'fit'>, bgColor: string): Promise<Blob> {
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
    // A long strip (the whole schedule at a zoom) can be very wide: stay inside what browsers will draw.
    const scale = Math.min(2, 30000 / w, 30000 / h, Math.sqrt(160e6 / (w * h)))
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale)
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0, w, h)
  }
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
  if (!blob) throw new Error('Could not create the image')
  return blob
}

/**
 * Export: choose what to export (whole schedule, what's on screen, or the whole schedule over several pages at the
 * screen's zoom), paper, how tall schedules fit, and background; see the pages; then save a PDF or PNG.
 */
export default function ExportPreview({ drawing, settings, onSettings, zoom, pages, bgColor, onClose, onPdf, onPng, saving, customControls }: {
  /** The drawing to preview: the long strip when split into pages, otherwise the one export chart. */
  drawing: () => SVGSVGElement | null
  settings: ExportSettings
  onSettings: (s: ExportSettings) => void
  /** When the timeline is zoomed in: its name ("6 months") and the dates on screen. Null at "Whole project". */
  zoom: { label: string; dates: string } | null
  pages: ExportPages | null
  bgColor: string
  /** Colour pickers for the Custom background. */
  customControls?: ReactNode
  onClose: () => void
  onPdf: () => void
  onPng: () => void
  saving: boolean
}) {
  const range: ExportRange = zoom ? settings.range : 'all'
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(null)
  // Re-read the drawing after every change (the hidden export charts re-render with the new settings first).
  useEffect(() => {
    const id = requestAnimationFrame(() => { const el = drawing(); setImg(el ? svgUrl(el) : null) })
    return () => cancelAnimationFrame(id)
  }, [drawing, settings, bgColor, customControls, pages?.count, range])

  const p = pageOf(settings.page)
  const set = (c: Partial<ExportSettings>) => onSettings({ ...settings, ...c })

  // One drawing on paper (whole schedule, or what's on screen).
  const PW = 760 // preview paper width, px
  const ppi = PW / p.w
  const PH = p.h * ppi, m = PAGE_MARGIN * ppi
  const innerW = PW - 2 * m, innerH = PH - 2 * m
  const drawH = img ? (innerW * img.h) / img.w : 0
  const downPages = settings.fit === 'fit' ? 1 : Math.max(1, Math.ceil(drawH / innerH - 0.01))

  // Split into pages: each page is one export chart (EXPORT_W wide) set on the paper's printable width, so a
  // page holds this many chart units of height; taller schedules continue onto pages below when not shrunk.
  const pageHU = ((p.h - 2 * PAGE_MARGIN) / (p.w - 2 * PAGE_MARGIN)) * EXPORT_W
  const rowsPer = range === 'pages' && settings.fit === 'width' && img ? Math.max(1, Math.ceil(img.h / pageHU - 0.01)) : 1
  const across = pages?.count ?? 1

  const fitText = settings.fit === 'fit'
    ? 'scaled to fit one page'
    : downPages === 1 ? 'at full width; fits on one page' : `at full width; runs onto ${downPages} pages`
  const summary = range === 'pages'
    ? `${across} page${across === 1 ? '' : 's'} across, each covering ${pages?.span ?? ''}${rowsPer > 1 ? `, each continuing onto ${rowsPer} pages down (${across * rowsPer} pages in all)` : ''}. Dashed lines show the page breaks (numbers bottom left of each page); every page repeats the title and the names column.`
    : range === 'view' ? `What’s on screen (${zoom?.dates}), ${fitText}.` : `The whole schedule, ${fitText}.`

  return (
    <Modal title="Export" size="wide" onClose={onClose}
      footer={<>
        <span className="muted small grow">
          “Save as PDF” opens the print dialog: choose <strong>Save as PDF</strong> as the printer. Paper size and margins are already set.
          {range === 'pages' ? ' The PNG is one long image.' : ''}
        </span>
        <button className="btn" onClick={onPng} disabled={saving}>Download PNG</button>
        <button className="btn primary" onClick={onPdf}>Save as PDF</button>
      </>}>
      <div className="xp-controls">
        <div className="xp-group">
          <span>Show</span>
          <div className="segmented small-seg">
            <button className={range === 'all' ? 'on' : ''} onClick={() => set({ range: 'all' })}>Whole schedule</button>
            <button className={range === 'view' ? 'on' : ''} disabled={!zoom} onClick={() => set({ range: 'view' })}
              title={zoom ? `Just ${zoom.dates}, as on screen` : 'Zoom the timeline in (12, 6 or 3 months) to export just what’s on screen'}>
              On screen
            </button>
            <button className={range === 'pages' ? 'on' : ''} disabled={!zoom} onClick={() => set({ range: 'pages' })}
              title={zoom ? `The whole schedule at the screen’s zoom, ${zoom.label} to a page` : 'Zoom the timeline in (12, 6 or 3 months) to split the schedule into pages at that zoom'}>
              {zoom ? `${zoom.label} per page` : 'Pages at zoom'}
            </button>
          </div>
        </div>
        <label>Paper
          <select className="field boxed" value={settings.page} onChange={(e) => set({ page: e.target.value as ExportPage })}>
            {EXPORT_PAGES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <div className="xp-group" title="When a schedule is taller than a page">
          <span>Tall schedules</span>
          <div className="segmented small-seg">
            <button className={settings.fit === 'fit' ? 'on' : ''} onClick={() => set({ fit: 'fit' })}>Shrink to page</button>
            <button className={settings.fit === 'width' ? 'on' : ''} onClick={() => set({ fit: 'width' })}>Continue on next page</button>
          </div>
        </div>
        <div className="xp-group" title="Brand tint and Brand dark come from the project’s colour (the dot next to its number on Overview)">
          <span>Background</span>
          <div className="segmented small-seg">
            {EXPORT_BGS.map((b) => <button key={b.id} title={b.hint} className={settings.bg === b.id ? 'on' : ''} onClick={() => set({ bg: b.id })}>{b.name}</button>)}
          </div>
        </div>
      </div>
      {customControls && <div className="xp-custom">{customControls}</div>}
      <p className="muted small">{summary}</p>

      {range === 'pages' ? (
        <div className="xp-pages xp-strip-scroll">
          {img && (
            <div className="xp-strip" style={{ width: `max(100%, ${across * 420}px)`, background: bgColor }}>
              <img src={img.url} alt="" />
              {(pages?.breaks ?? []).map((bx) => (
                <span key={bx} className="xp-break v" style={{ left: `${(bx / img.w) * 100}%` }} />
              ))}
              {Array.from({ length: rowsPer - 1 }, (_, j) => (
                <span key={j} className="xp-break h" style={{ top: `${(((j + 1) * pageHU) / img.h) * 100}%` }} />
              ))}
              {Array.from({ length: across }, (_, c) => Array.from({ length: rowsPer }, (_, r) => (
                <span key={`${c}-${r}`} className="xp-pnum"
                  style={{ left: `calc(${((c === 0 ? 0 : pages!.breaks[c - 1]) / img.w) * 100}% + 6px)`, top: `calc(${(Math.min((r + 1) * pageHU, img.h) / img.h) * 100}% - 24px)` }}>
                  {c * rowsPer + r + 1}
                </span>
              )))}
            </div>
          )}
        </div>
      ) : (
        <div className="xp-pages">
          {img && Array.from({ length: downPages }, (_, i) => (
            <div key={i} className="xp-paper" style={{ width: PW, height: PH, background: bgColor, padding: m }}>
              <div className="xp-inner" style={{ width: innerW, height: innerH }}>
                {settings.fit === 'fit'
                  ? <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' }} />
                  : <img src={img.url} alt="" style={{ width: innerW, height: drawH, marginTop: -i * innerH }} />}
              </div>
              {downPages > 1 && <span className="xp-num">{i + 1} / {downPages}</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
