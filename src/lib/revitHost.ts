import { useCallback, useEffect, useState } from 'react'

/**
 * Talking to the Revit add-in (revit-plugin/). The add-in is a thin shell: it shows this web app's /revit page in a
 * docked pane and a small floating panel, tells it which model, sheets and views are open, and does the few things
 * only Revit can (open a view, install an update). Everything else (sign-in, tasks, assigning, live updates) is
 * the web app, so changes here reach everyone's Revit with the next site deploy.
 *
 * Page → add-in: { id, type, ... }.  Add-in → page: { type: 'reply', id, ok, result | error } and
 * { type: 'event', event, data }.
 *
 * Open the page in an ordinary browser with ?host=mock (before the #) to try it against a pretend model.
 */

export interface RevitView { id: string; name: string; type: string }
export interface RevitSheet { id: string; number: string; name: string; views: RevitView[] }
/** What's on screen in Revit. `sheetIds`: for a view, the sheets it's placed on. */
export interface RevitActive { id: string; name: string; kind: 'sheet' | 'view' | 'none'; number?: string; sheetIds: string[] }
export interface RevitModel {
  /** False when no project is open in Revit (or a family is being edited). */
  open: boolean
  /** The model's Project Information UniqueId: the same for everyone working in the model. */
  modelId: string
  title: string
  number: string
  name: string
  sheets: RevitSheet[]
  active: RevitActive | null
}
export interface UpdateStatus {
  current: string; latest: string | null; pending: string | null; available: boolean
  state: 'idle' | 'checking' | 'downloading' | 'installing' | 'installed' | 'error'; error: string | null; auto: boolean
}
export interface HostInfo { host: 'revit' | 'mock'; version: string; revit: string; update?: UpdateStatus; overlay?: boolean }
/** A right-click or ribbon command in Revit, aimed at the selected sheets or views. */
export interface RevitCommand { name: 'show' | 'add' | 'task'; ids: string[]; at: number }

interface WebViewBridge {
  postMessage: (m: unknown) => void
  addEventListener: (t: 'message', fn: (e: { data: unknown }) => void) => void
  removeEventListener: (t: 'message', fn: (e: { data: unknown }) => void) => void
}
const webview = (window as unknown as { chrome?: { webview?: WebViewBridge } }).chrome?.webview ?? null
const mockOn = !webview && new URLSearchParams(window.location.search).get('host') === 'mock'

/** True inside the add-in (or the pretend one). */
export const inRevit = Boolean(webview) || mockOn

// ---------- pretend add-in, for trying the panel in a browser ----------

const MOCK_SHEETS: RevitSheet[] = [
  { id: 'rv-g000', number: 'G000', name: 'Cover Sheet', views: [] },
  { id: 'rv-a101', number: 'A101', name: 'Architectural Site Plan', views: [{ id: 'rv-v-site', name: 'Site Plan', type: 'FloorPlan' }] },
  { id: 'rv-a102', number: 'A102', name: 'Floor Plan: Reference', views: [{ id: 'rv-v-l1', name: 'Level 1 Floor Plan', type: 'FloorPlan' }] },
  { id: 'rv-a104', number: 'A104', name: 'Reflected Ceiling Plan', views: [{ id: 'rv-v-rcp', name: 'Level 1 RCP', type: 'CeilingPlan' }] },
  { id: 'rv-a401', number: 'A401', name: 'Enlarged Plans & Interior Elevations', views: [
    { id: 'rv-v-toilet', name: 'Enlarged Toilet Plan', type: 'FloorPlan' }, { id: 'rv-v-lobby', name: 'Interior Elevation - Lobby', type: 'Elevation' }] },
  { id: 'rv-a501', number: 'A501', name: 'Wall Sections', views: [{ id: 'rv-v-ws1', name: 'Wall Section 1', type: 'Section' }] },
  { id: 'rv-a601', number: 'A601', name: 'Door Schedule', views: [] },
]
const mock = {
  activeId: 'rv-a102',
  overlay: false,
  active(): RevitActive {
    const s = MOCK_SHEETS.find((x) => x.id === this.activeId)
    if (s) return { id: s.id, name: s.name, kind: 'sheet', number: s.number, sheetIds: [] }
    for (const sh of MOCK_SHEETS) {
      const v = sh.views.find((x) => x.id === this.activeId)
      if (v) return { id: v.id, name: v.name, kind: 'view', sheetIds: [sh.id] }
    }
    return { id: 'rv-3d', name: '{3D}', kind: 'view', sheetIds: [] }
  },
  model(): RevitModel {
    return { open: true, modelId: 'mock-model-1', title: 'Sample Library Renovation.rvt', number: '2026-001', name: 'Sample Library Renovation', sheets: MOCK_SHEETS, active: this.active() }
  },
}
const listeners = new Set<(event: string, data: unknown) => void>()
const emit = (event: string, data: unknown) => { for (const fn of listeners) fn(event, data) }

/** Pretend-add-in controls (window.revitMock in the browser console, and the grey bar at the top of the panel). */
export const revitMock = mockOn ? {
  sheets: MOCK_SHEETS,
  views: () => [...MOCK_SHEETS.map((s) => ({ id: s.id, label: `${s.number} ${s.name}` })),
    ...MOCK_SHEETS.flatMap((s) => s.views.map((v) => ({ id: v.id, label: `View: ${v.name}` }))), { id: 'rv-3d', label: 'View: {3D} (not on a sheet)' }],
  activeId: () => mock.activeId,
  setActive(id: string) { mock.activeId = id; emit('viewChanged', mock.active()) },
  command(name: RevitCommand['name'], ids: string[]) { emit('command', { name, ids }) },
} : null
if (revitMock) (window as unknown as { revitMock: unknown }).revitMock = revitMock

// ---------- requests ----------

let seq = 0
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

if (webview) {
  webview.addEventListener('message', (e) => {
    const m = (typeof e.data === 'string' ? JSON.parse(e.data) : e.data) as { type?: string; id?: number; ok?: boolean; result?: unknown; error?: string; event?: string; data?: unknown }
    if (m?.type === 'reply' && typeof m.id === 'number') {
      const w = waiting.get(m.id)
      if (!w) return
      waiting.delete(m.id)
      if (m.ok) w.resolve(m.result); else w.reject(new Error(m.error || 'Revit could not do that.'))
    } else if (m?.type === 'event' && m.event) emit(m.event, m.data)
  })
}

/** Ask the add-in for something. Rejects with Revit's message when it can't. */
export function ask<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (webview) {
    const id = ++seq
    return new Promise<T>((resolve, reject) => {
      waiting.set(id, { resolve: resolve as (v: unknown) => void, reject })
      webview.postMessage({ id, type, ...payload })
      window.setTimeout(() => { if (waiting.delete(id)) reject(new Error('Revit didn’t answer. It may be busy with a command.')) }, 30000)
    })
  }
  if (!mockOn) return Promise.reject(new Error('Not running inside Revit.'))
  const update: UpdateStatus = { current: '0.0.0', latest: '0.0.0', pending: null, available: false, state: 'idle', error: null, auto: true }
  const answers: Record<string, () => unknown> = {
    hello: () => ({ host: 'mock', version: '0.0.0', revit: 'pretend', update, overlay: mock.overlay } satisfies HostInfo),
    getModel: () => mock.model(),
    open: () => { revitMock!.setActive(String(payload.id)); return true },
    setOverlay: () => { mock.overlay = Boolean(payload.on); return mock.overlay },
    showPane: () => true,
    overlaySize: () => true,
    openUrl: () => { window.open(String(payload.url), '_blank'); return true },
    checkUpdate: () => update,
    installUpdate: () => update,
  }
  const fn = answers[type]
  return fn ? Promise.resolve(fn() as T) : Promise.reject(new Error(`Unknown request: ${type}`))
}

/** The model open in Revit, what's on screen there, and the last right-click command; kept current by the add-in's events. */
export function useRevit() {
  const [info, setInfo] = useState<HostInfo | null>(null)
  const [model, setModel] = useState<RevitModel | null>(null)
  const [command, setCommand] = useState<RevitCommand | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try { setModel(await ask<RevitModel>('getModel')); setError(null) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [])

  useEffect(() => {
    if (!inRevit) return
    let wait: number | undefined
    const on = (event: string, data: unknown) => {
      if (event === 'viewChanged') setModel((m) => (m ? { ...m, active: data as RevitActive } : m))
      else if (event === 'modelChanged') { window.clearTimeout(wait); wait = window.setTimeout(() => void refresh(), 600) }
      else if (event === 'command') setCommand({ ...(data as { name: RevitCommand['name']; ids: string[] }), at: Date.now() })
      else if (event === 'update') setInfo((i) => (i ? { ...i, update: data as UpdateStatus } : i))
      else if (event === 'overlay') setInfo((i) => (i ? { ...i, overlay: Boolean(data) } : i))
    }
    listeners.add(on)
    // Initial read: asking the add-in is syncing with an external system.
    void ask<HostInfo>('hello').then(setInfo).catch(() => undefined)
    void ask<RevitModel>('getModel').then((m) => { setModel(m); setError(null) }).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    return () => { listeners.delete(on); window.clearTimeout(wait) }
  }, [refresh])

  return { info, setInfo, model, command, clearCommand: () => setCommand(null), error, refresh }
}

/** Same sheet number, however it's typed ("A-101", "a101", "A 101"). */
export const sameNumber = (a: string | null | undefined, b: string | null | undefined) => {
  const k = (s: string | null | undefined) => (s ?? '').replace(/[\s._-]+/g, '').toUpperCase()
  return k(a) !== '' && k(a) === k(b)
}
