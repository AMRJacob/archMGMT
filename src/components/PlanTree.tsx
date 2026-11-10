import { lockHolder, usePresence } from '../lib/live.ts'
import { useSearchParams } from 'react-router-dom'
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import ContextMenu, { type MenuItem } from './ContextMenu.tsx'
import { TextField } from './fields.tsx'
import { remove } from '../lib/data.ts'
import {
  branchOf, canDemote, canHold, canPromote, clearClip, CLIP_EVENT, cloneRows, demote, isWithin, kindUnder, moveTo,
  placeAmong, promote, readClip, saveClip, slotFor, type Change, type Clip, type Place,
} from '../lib/treeEdit.ts'
import { MilestoneMark, Pop, TaskControls } from './TaskChips.tsx'
import { guessSheetType, nextSheetNumbers, SHEET_TYPES, sheetRows, sheetTypeById } from '../lib/sheetTypes.ts'
import { childrenOf, descendants, isItem, isSheetWork, kindOf, progressOf, rolledDates, scheduledChildren, workGroupOf, type Tree, type WorkGroup } from '../lib/tree.ts'
import { assigneesOf, assignPatch } from '../lib/assignees.ts'
import { carryRows, phaseOrder, phaseShort, phasesOfSheet, sheetsBefore, typeHint } from '../lib/sheetLinks.ts'
import Modal from './Modal.tsx'
import { KIND_RANK, type Person, type Phase, type Task, type TaskKind } from '../lib/types.ts'

const ghostName = (t: Task) =>
  t.is_milestone ? 'Milestone name' : ({ sheet: 'Sheet name', section: 'Section name', task: 'Task name', item: 'Subtask' } as const)[kindOf(t)]

/** The row being dragged, shared by every phase's tree so rows can move between phases. */
let dragging: { id: string } | null = null

// ---------- selection: shared by every phase's tree, so Shift/Ctrl picks can span phases ----------
// Click a row's left margin (or anywhere on it with Shift/Ctrl/Cmd) to select it instead of editing.
// Shift picks a run of rows in screen order; Ctrl/Cmd adds or removes one.
type Sel = { ids: Set<string>; anchor: string | null }
let sel: Sel = { ids: new Set(), anchor: null }
const selListeners = new Set<() => void>()
const setSel = (ids: Set<string>, anchor: string | null) => { sel = { ids, anchor }; selListeners.forEach((l) => l()) }
const selectOne = (id: string) => { if (sel.ids.size !== 1 || !sel.ids.has(id)) setSel(new Set([id]), id) }
export const clearSelection = () => { if (sel.ids.size) setSel(new Set(), null) }
const useSel = () => useSyncExternalStore((cb) => { selListeners.add(cb); return () => { selListeners.delete(cb) } }, () => sel)
function pickRow(id: string, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) {
  const add = e.ctrlKey || e.metaKey
  if (e.shiftKey && sel.anchor) {
    const order = [...document.querySelectorAll<HTMLElement>('li[data-row]')].map((el) => el.dataset.row!)
    const a = order.indexOf(sel.anchor), b = order.indexOf(id)
    if (a >= 0 && b >= 0) {
      const ids = new Set(add ? sel.ids : [])
      order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => ids.add(x))
      setSel(ids, sel.anchor)
      return
    }
  }
  if (add) { const ids = new Set(sel.ids); if (ids.has(id)) ids.delete(id); else ids.add(id); setSel(ids, id); return }
  selectOne(id)
}
// Clicking away from the rows (and their menus and panels) clears the selection.
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', (e) => {
    const el = e.target as HTMLElement | null
    if (el && !el.closest('li[data-row], .ctx-menu, .pop-menu, .quick-panel, .modal, [role="dialog"]')) clearSelection()
  })
}

/** Adds the phase header menu can ask for. */
export type PhaseAdd = { what: 'task' | 'milestone' | 'sheet' | 'section' | 'plan' | 'quick'; n: number }

type MenuState = { x: number; y: number; target: Task | null; only?: 'add-inside' | 'seam' | WorkGroup; place?: Place }

/**
 * One phase's work as a tree. Terms: General Tasks: task → subtask; Sheets: sheet → view → task → subtask;
 * Project Manual: spec section → task → subtask. Subtasks (kind 'item') are tick-box lines, never scheduled.
 * Every row is edited in place. Right-click anywhere to add at that spot, move rows by dragging the grip,
 * promote/demote from the menu (or Ctrl+[ / Ctrl+]), and cut/copy/paste with the menu or Ctrl+X/C/V.
 */
export default function PlanTree({
  phase, tree, phases, people, projectId, onPatch, onPatchMany, onDrop, onAdd, onAddMany, presented, onTogglePresented, onAddNote, noteCount, onOpenNotes, emptyNote,
  request, onRequestDone,
}: {
  /** An add asked for from outside (the phase's own right-click menu); run once, then onRequestDone. */
  request?: PhaseAdd | null
  onRequestDone?: () => void
  /** Meeting notes: start one for a row, how many it has, open its latest. */
  onAddNote?: (t: Task) => void
  /** Shown instead of the add button when the phase is empty because of a filter (e.g. Only mine). */
  emptyNote?: string
  noteCount?: (t: Task) => number
  onOpenNotes?: (t: Task) => void
  /** Whether a row is in the presentation view, and flipping it (right-click menu). */
  presented?: (t: Task) => boolean
  onTogglePresented?: (t: Task) => void
  phase: Phase
  tree: Tree
  phases: Phase[]
  people: Person[]
  projectId: string
  onPatch: (t: Task, changes: Partial<Task>, record?: boolean) => void
  onPatchMany: (changes: Change[], record?: boolean) => void
  onDrop: (id: string) => void
  onAdd: (row: Partial<Task>) => Promise<Task>
  onAddMany: (rows: Partial<Task>[]) => Promise<void>
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  // Rows someone else is editing right now: shown with their name and not editable here until they're done.
  const presence = usePresence()
  const lockedBy = (id: string) => lockHolder(presence, id) ?? undefined
  // Search sends ?find=<id>: open the rows above it so it's on screen.
  const [params] = useSearchParams()
  const findId = params.get('find')
  const [foundFor, setFoundFor] = useState<string | null>(null)
  if (findId && findId !== foundFor) {
    const byId = tree.byId
    if (byId.has(findId)) {
      const up: string[] = []
      for (let p = byId.get(findId)?.parent_id; p; p = byId.get(p)?.parent_id) up.push(p)
      setFoundFor(findId)
      if (up.some((u) => !open.has(u))) setOpen(new Set([...open, ...up]))
    }
  }
  const [newId, setNewId] = useState<string | null>(null)
  const [addingSheet, setAddingSheet] = useState(false)
  const [planning, setPlanning] = useState(false)
  // Sheets from earlier phases: carry some into this phase ('add'), or make a sheet the same as one ('link').
  const [carryPick, setCarryPick] = useState<{ mode: 'add' } | { mode: 'link'; sheet: Task } | null>(null)
  const allRows = [...tree.byId.values()]

  /** Carry sheets into a phase as linked copies (the sources get a link id if they had none). */
  async function carryInto(sources: Task[], ph: Phase) {
    const topHere = childrenOf(tree, null).filter((t) => t.phase_id === ph.id)
    let order = topHere.reduce((m, t) => Math.max(m, t.sort_order), topHere.length - 1) + 1
    const rows: Partial<Task>[] = []
    for (const src of sources) {
      const c = carryRows(src, ph, { sortOrder: order++ })
      if (c.linkSource) onPatch(src, { sheet_link: c.linkSource }, false)
      rows.push(c.sheet, ...c.items)
    }
    if (rows.length) await onAddMany(rows)
  }
  /** Make `sheet` the same drawing as `source` (an earlier phase's sheet): shared link, number, name and type. */
  function linkTo(sheet: Task, source: Task) {
    const link = source.sheet_link ?? crypto.randomUUID()
    if (!source.sheet_link) onPatch(source, { sheet_link: link }, false)
    onPatch(sheet, { sheet_link: link, sheet_number: source.sheet_number ?? null, title: source.title || sheet.title, sheet_type: source.sheet_type ?? sheet.sheet_type })
  }
  const nextPhaseOf = (t: Task) => {
    const order = phaseOrder(phases)
    const i = order.findIndex((p) => p.id === t.phase_id)
    return i >= 0 ? order[i + 1] ?? null : null
  }
  const selection = useSel()
  const setSelected = (id: string) => selectOne(id)
  const isSel = (id: string) => selection.ids.has(id)
  // The description box opens only when asked for (menu or the ≡ marker), never just by selecting a row.
  const [descFor, setDescFor] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [hint, setHint] = useState<{ id: string; place: Place } | null>(null)
  const [clip, setClip] = useState<Clip | null>(() => readClip())
  const [seamPick, setSeamPick] = useState<{ key: string; idx: number } | null>(null)

  useEffect(() => {
    const sync = () => setClip(readClip())
    window.addEventListener(CLIP_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(CLIP_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  const top = childrenOf(tree, null).filter((t) => t.phase_id === phase.id)
  // Each phase's General Tasks / Sheets groups fold away separately; remembered in this browser.
  const foldKey = `archmgmt.groupFold.${phase.id}`
  const [folded, setFolded] = useState<Partial<Record<WorkGroup, boolean>>>(() => {
    try { return JSON.parse(localStorage.getItem(foldKey) ?? '{}') } catch { return {} }
  })
  const fold = (g: WorkGroup) => setFolded((f) => {
    const next = { ...f, [g]: !f[g] }
    try { localStorage.setItem(foldKey, JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })
  const topTasks = top.filter((t) => workGroupOf(tree, t) === 'tasks')
  const topSheets = top.filter((t) => workGroupOf(tree, t) === 'sheets')
  const topManual = top.filter((t) => workGroupOf(tree, t) === 'manual')
  const groupHead = (cls: string, label: string, n: number, g = cls.split(' ')[0] as WorkGroup) => (
    <li key={`head-${g}`} className={`tgroup-head ${cls}${folded[g] ? ' folded' : ''}`} role="button" tabIndex={0} aria-expanded={!folded[g]}
      title={folded[g] ? `Show ${label.toLowerCase()}` : `Collapse ${label.toLowerCase()}`}
      onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) fold(g) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fold(g) } }} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, target: null, only: g }) }}>
      <span className="caret" aria-hidden="true">▾</span><span>{label}</span><span className="count">{n}</span>
      <button className="icon-btn" title={g === 'tasks' ? 'Add a task or milestone' : g === 'sheets' ? 'Add sheets' : 'Add a spec section'}
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, target: null, only: g }) }}>+</button>
    </li>
  )
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const expand = (id: string | null | undefined) => { if (id) setOpen((o) => new Set([...o, id])) }
  const cutIds = new Set(clip?.mode === 'cut' ? clip.rows.map((r) => r.id) : [])

  /** Sort order for something new at a spot; renumbers the neighbours when it lands between rows. */
  function orderAt(target: Task | null, place: Place, count = 1): { sortOrders: number[]; parent: Task | null; phaseId: string | null } {
    const slot = slotFor(tree, target, place, phase.id)
    if (!slot.arrange) {
      const base = slot.siblings.reduce((m, t) => Math.max(m, t.sort_order), slot.siblings.length - 1) + 1
      return { sortOrders: Array.from({ length: count }, (_, i) => base + i), parent: slot.parent, phaseId: slot.phase }
    }
    const fakes = Array.from({ length: count }, (_, i) => ({ id: `__new${i}`, sort_order: 0 }) as Task)
    const changes = placeAmong(tree, slot.parent?.id ?? null, slot.phase, fakes, slot.anchor, slot.where)
    onPatchMany(changes.filter((c) => !c.task.id.startsWith('__new')), false)
    return { sortOrders: fakes.map((f) => changes.find((c) => c.task.id === f.id)!.next.sort_order!), parent: slot.parent, phaseId: slot.phase }
  }

  /** Add a new row at a spot. `inside` adds it as the last thing under the target. */
  async function addAt(target: Task | null, place: Place, kind: TaskKind, milestone = false) {
    const { sortOrders, parent, phaseId } = orderAt(target, place)
    const ph = phases.find((x) => x.id === phaseId) ?? phase
    const k = (kind === 'sheet' || kind === 'section') && parent ? kindUnder(parent, 'task') : kindUnder(parent, kind)
    const created = await onAdd({
      id: crypto.randomUUID(), project_id: projectId, phase_id: ph.id, parent_id: parent?.id ?? null, kind: k,
      title: '',
      sheet_number: null, sheet_type: k === 'sheet' ? 'other' : null,
      ...assignPatch(parent ? assigneesOf(parent) : []),
      // Sheets span their phase; tasks and milestones start undated, to be placed on the timeline
      // (or given dates with the date chip) where they belong, instead of landing somewhere arbitrary.
      start_date: k === 'sheet' || k === 'section' ? ph.start_date : null,
      due_date: k === 'sheet' || k === 'section' ? ph.end_date : null,
      estimated_hours: null, effort: k === 'item' ? null : 2, status: 'todo',
      is_milestone: milestone, client_visible: milestone, sort_order: sortOrders[0],
    })
    expand(parent?.id)
    // A folded group would hide the new row: open it.
    const g: WorkGroup = parent ? workGroupOf(tree, parent) : k === 'sheet' ? 'sheets' : k === 'section' ? 'manual' : 'tasks'
    if (folded[g]) fold(g)
    setNewId(created.id)
    setSelected(created.id)
  }

  // The phase header's right-click menu asks for adds here, so they land (and get focused) like any other.
  const handled = useRef(0)
  useEffect(() => {
    if (!request || handled.current === request.n) return
    handled.current = request.n
    onRequestDone?.()
    if (request.what === 'plan') setPlanning(true)
    else if (request.what === 'quick') setAddingSheet(true)
    else void addAt(null, 'inside', request.what === 'milestone' ? 'task' : request.what, request.what === 'milestone')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  // ---------- clipboard ----------
  const copy = (t: Task, mode: Clip['mode']) => saveClip({ mode, rootIds: [t.id], rows: branchOf(tree, [t]) })

  async function pasteClip(c: Clip, target: Task | null, place: Place) {
    const local = c.rootIds.map((id) => tree.byId.get(id)).filter((t): t is Task => Boolean(t))
    if (c.mode === 'cut' && local.length === c.rootIds.length) {
      // Moving within this project: the same rows move, nothing is recreated.
      let anchor = target, at = place
      const changes: Change[] = []
      for (const r of local) {
        if (target && isWithin(tree, r, target.id)) continue
        changes.push(...moveTo(tree, r, anchor, at, phase.id))
        anchor = r; at = 'after'
      }
      if (changes.length) onPatchMany(changes)
      clearClip()
      return
    }
    const { sortOrders, parent, phaseId } = orderAt(target, place, c.rootIds.length)
    const rows = cloneRows(c.rows, c.rootIds, { projectId, phaseId, parentId: parent?.id ?? null, parentKind: parent, sortOrders })
    await onAddMany(rows)
    expand(parent?.id)
    if (c.mode === 'cut') {
      // Cut from another project: the copies are in place, so take the originals away.
      for (const id of c.rootIds) await remove('tasks', id)
      clearClip()
    }
  }
  const paste = (target: Task | null, place: Place) => { const c = readClip(); if (c) void pasteClip(c, target, place) }
  const duplicate = (t: Task) => void pasteClip({ mode: 'copy', rootIds: [t.id], rows: branchOf(tree, [t]) }, t, 'after')

  const del = (t: Task) => {
    const under = descendants(tree, t.id).length
    if (window.confirm(under ? `Delete "${t.title}" and the ${under} thing${under === 1 ? '' : 's'} under it?` : `Delete "${t.title}"?`)) onDrop(t.id)
  }

  /** The selected rows that aren't inside another selected row (moving / deleting those carries the rest). */
  const selRoots = (): Task[] => {
    const ids = sel.ids
    return [...ids].map((id) => tree.byId.get(id)).filter((x): x is Task => Boolean(x)).filter((x) => {
      for (let p = x.parent_id; p; p = tree.byId.get(p)?.parent_id ?? null) if (ids.has(p)) return false
      return true
    })
  }
  const many = () => sel.ids.size > 1
  const delMany = () => {
    const roots = selRoots()
    if (!roots.length) return
    const under = roots.reduce((n, r) => n + descendants(tree, r.id).length, 0)
    const what = `${roots.length} item${roots.length === 1 ? '' : 's'}${under ? ` and the ${under} thing${under === 1 ? '' : 's'} under them` : ''}`
    if (!window.confirm(`Delete ${what}?`)) return
    roots.forEach((r) => onDrop(r.id))
    clearSelection()
  }
  const copyMany = (mode: Clip['mode']) => { const roots = selRoots(); if (roots.length) saveClip({ mode, rootIds: roots.map((r) => r.id), rows: branchOf(tree, roots) }) }
  const markMany = (status: Task['status']) => {
    const rows = [...sel.ids].map((id) => tree.byId.get(id)).filter((x): x is Task => Boolean(x) && x!.status !== status)
    if (rows.length) onPatchMany(rows.map((task) => ({ task, next: { status } })))
  }

  const promoteRow = (t: Task) => { const c = promote(tree, t); if (c.length) onPatchMany(c) }
  const demoteRow = (t: Task) => { const c = demote(tree, t); if (c.length) { onPatchMany(c); expand(c[0].next.parent_id) } }

  /** Keys on a selected row. Ctrl+[ / Ctrl+] (promote / demote) also work while editing its title. */
  const rowKeys = (t: Task) => (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest('input, textarea, select')
    const mod = e.ctrlKey || e.metaKey
    if (mod && (e.code === 'BracketLeft' || e.key === '[')) { e.preventDefault(); promoteRow(t); return }
    if (mod && (e.code === 'BracketRight' || e.key === ']')) { e.preventDefault(); demoteRow(t); return }
    if (typing) return
    const k = e.key.toLowerCase()
    if (e.key === 'Escape') { clearSelection(); return }
    // With a selection, the keys act on it (even if the focused row was just Ctrl-clicked off).
    if (many() || (sel.ids.size === 1 && !sel.ids.has(t.id))) {
      if (mod && k === 'c') { e.preventDefault(); copyMany('copy') }
      else if (mod && k === 'x') { e.preventDefault(); copyMany('cut') }
      else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); delMany() }
      return
    }
    if (mod && k === 'c') { e.preventDefault(); copy(t, 'copy') }
    else if (mod && k === 'x') { e.preventDefault(); copy(t, 'cut') }
    else if (mod && k === 'v') { e.preventDefault(); paste(t, 'after') }
    else if (mod && k === 'd') { e.preventDefault(); duplicate(t) }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(t) }
  }

  // ---------- drag and drop ----------
  const placeFor = (e: DragEvent, t: Task): Place => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    if (!canHold(t)) return y < 0.5 ? 'before' : 'after'
    return y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside'
  }
  const dragProps = (t: Task) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragging) return
      const row = tree.byId.get(dragging.id)
      if (row && isWithin(tree, row, t.id)) return
      e.preventDefault(); e.stopPropagation()
      e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move'
      const place = placeFor(e, t)
      if (hint?.id !== t.id || hint.place !== place) setHint({ id: t.id, place })
    },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHint(null) },
    onDrop: (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation()
      const place = placeFor(e, t)
      setHint(null)
      dropRow(e, t, place)
    },
  })
  function dropRow(e: DragEvent, target: Task | null, place: Place) {
    const id = dragging?.id
    dragging = null
    const row = id ? tree.byId.get(id) : undefined
    if (!row) return
    if (e.ctrlKey || e.altKey) { void pasteClip({ mode: 'copy', rootIds: [row.id], rows: branchOf(tree, [row]) }, target, place); return }
    const c = moveTo(tree, row, target, place, phase.id)
    if (c.length) { onPatchMany(c); if (place === 'inside') expand(target?.id) }
  }
  const grip = (t: Task) => (
    <>
    <span className="sel-zone" aria-hidden="true" title="Click to select · Shift-click for a run · Ctrl/Cmd-click to add" />
    <span className="grip" draggable title="Drag to move (hold Ctrl to copy)"
      onDragStart={(e) => {
        dragging = { id: t.id }
        e.dataTransfer.effectAllowed = 'copyMove'
        e.dataTransfer.setData('text/plain', t.title)
        const li = (e.currentTarget as HTMLElement).closest('li')
        if (li) e.dataTransfer.setDragImage(li, 20, 14)
      }}
      onDragEnd={() => { dragging = null; setHint(null) }}>
      <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">{[2, 7, 12].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1.2" />, <circle key={`b${y}`} cx="6" cy={y} r="1.2" />])}</svg>
    </span>
    </>
  )
  /**
   * The + that appears on the seam between rows: click it to add something right there. Where a branch
   * ends, the seam serves several levels; the pointer's left/right position picks which (the + slides).
   */
  const seam = (cands: { task: Task; depth: number }[], place: 'before' | 'after') => {
    const key = `${cands[0].task.id}-${place}`
    const idx = seamPick?.key === key ? seamPick.idx : 0
    const pick = cands[Math.min(idx, cands.length - 1)]
    return (
      <button type="button" className={`seam ${place}`} tabIndex={-1}
        style={{ '--seam-x': `${40 + pick.depth * 24 - 30}px` } as CSSProperties}
        aria-label={`Add ${place === 'before' ? 'above' : 'below'} “${pick.task.title || ghostName(pick.task)}”`}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseMove={cands.length > 1 ? (e) => {
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left
          // Deepest level whose indent is left of the pointer.
          let i = cands.findIndex((c) => 40 + c.depth * 24 - 14 <= x)
          if (i < 0) i = cands.length - 1
          if (seamPick?.key !== key || seamPick.idx !== i) setSeamPick({ key, idx: i })
        } : undefined}
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.querySelector('.seam-plus')!.getBoundingClientRect()
          setSelected(pick.task.id)
          setMenu({ x: r.left, y: r.bottom + 4, target: pick.task, only: 'seam', place })
        }}>
        <span className="seam-line" /><span className="seam-plus">+</span>
      </button>
    )
  }

  const rowProps = (t: Task, className: string, depth: number) => ({
    'data-locked-by': lockedBy(t.id),
    className: `${className}${isSheetWork(tree, t) ? ' sheet-side' : ''}${lockedBy(t.id) ? ' locked' : ''}${isSel(t.id) ? ' selected' : ''}${cutIds.has(t.id) ? ' cutting' : ''}${hint?.id === t.id ? ` drop-${hint.place}` : ''}`,
    style: { paddingLeft: 40 + depth * 24, '--indent': `${40 + depth * 24}px`, '--d': depth } as CSSProperties,
    tabIndex: -1,
    'data-row': t.id,
    'data-depth': depth,
    // Editing a row's fields selects just that row.
    onFocus: (e: FocusEvent) => { if ((e.target as HTMLElement).closest('input, textarea, select') && !isSel(t.id)) setSelected(t.id) },
    onMouseDown: (e: MouseEvent) => {
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      // Shift / Ctrl / Cmd click anywhere on the row selects (never starts editing).
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // (On the drag handle, don't block a Ctrl-drag copy from starting.)
        if (!el.closest('.grip')) e.preventDefault()
        pickRow(t.id, e); (e.currentTarget as HTMLElement).focus({ preventScroll: true }); return
      }
      if (!el.closest('input, button, select, textarea, .pop')) { pickRow(t.id, e); (e.currentTarget as HTMLElement).focus({ preventScroll: true }) }
    },
    onKeyDown: rowKeys(t),
    onContextMenu: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return // keep the browser menu for text
      e.preventDefault(); e.stopPropagation()
      if (!isSel(t.id)) setSelected(t.id)
      setMenu({ x: e.clientX, y: e.clientY, target: t })
    },
    ...dragProps(t),
  })

  /**
   * Title field. New rows start empty with a ghosted name: Enter keeps it and starts another of the same
   * kind right below (like Asana); Esc, or leaving it empty, takes the new row away again.
   */
  const title = (t: Task, className = '') => {
    const isNew = t.id === newId
    const k = kindOf(t)
    return (
      <TextField value={t.title} className={className} autoFocus={isNew} placeholder={ghostName(t)}
        onSave={(v) => {
          if (v) onPatch(t, { title: v }, false)
          else if (isNew || !t.title) { onDrop(t.id) }
          if (isNew) setNewId(null)
        }}
        onEnter={(v) => { if (v) void addAt(t, 'after', k === 'sheet' ? 'sheet' : k, t.is_milestone) }}
        onEscape={isNew ? () => { setNewId(null); onDrop(t.id) } : undefined} />
    )
  }

  /** First row among its siblings: it also gets a seam above it. */
  const firstOf = (t: Task) => {
    const sibs = t.parent_id ? childrenOf(tree, t.parent_id) : top
    return sibs[0]?.id === t.id
  }

  /** `enders`: ancestors whose branch ends right after this row (their seam is drawn here). */
  const node = (t: Task, depth: number, enders: { task: Task; depth: number }[] = []): ReactNode[] => {
    const kind = kindOf(t)
    if (isItem(t)) {
      return [
        <li key={t.id} {...rowProps(t, `irow${t.status === 'done' ? ' done' : ''}`, depth)}>
          {grip(t)}
          <input type="checkbox" checked={t.status === 'done'} title="Done"
            onChange={(e) => onPatch(t, { status: e.target.checked ? 'done' : 'todo' }, false)} />
          <div className="trow-title">{title(t)}</div>
          <button className="icon-btn" title="Remove subtask" onClick={() => onDrop(t.id)}>×</button>
          {firstOf(t) && seam([{ task: t, depth }], 'before')}
          {seam([{ task: t, depth }, ...enders], 'after')}
        </li>,
      ]
    }
    const kids = childrenOf(tree, t.id)
    const isOpen = open.has(t.id)
    const parent = scheduledChildren(tree, t.id).length > 0
    const prog = progressOf(tree, t)
    const r = rolledDates(tree, t)
    const shown = { ...t, start_date: r.start, due_date: r.due }
    const type = kind === 'sheet' ? sheetTypeById(t.sheet_type) : null
    return [
      <li key={t.id} {...rowProps(t, `trow k-${kind}${t.status === 'done' ? ' done' : ''}`, depth)}>
        {grip(t)}
        <button className={`twist${isOpen ? ' open' : ''}${kids.length ? '' : ' empty'}`} onClick={() => toggle(t.id)}
          title={isOpen ? 'Collapse' : kids.length ? `Show ${kids.length} under it` : 'Add tasks or subtasks under it'}>
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button className={`tick ${t.status}`} title={t.status === 'done' ? 'Mark not done' : 'Mark done'}
          onClick={() => onPatch(t, { status: t.status === 'done' ? 'todo' : 'done' })}>
          {t.status === 'done' ? '✓' : ''}
        </button>
        {t.is_milestone && <MilestoneMark task={t} onPatch={(c) => onPatch(t, c)} />}
        {kind === 'sheet' && (
          <TextField value={t.sheet_number ?? null} placeholder="No." className="sheet-no mono" onSave={(v) => onPatch(t, { sheet_number: v }, false)} />
        )}
        {kind === 'section' && (
          <TextField value={t.sheet_number ?? null} placeholder="Section" className="sheet-no section-no mono" onSave={(v) => onPatch(t, { sheet_number: v }, false)} />
        )}
        <div className="trow-title">{title(t, kind === 'sheet' || kind === 'section' ? 'sheet-title' : '')}</div>
        {kind === 'sheet' && t.sheet_link && (() => {
          const in_ = phasesOfSheet(allRows, phases, t)
          if (in_.length < 2) return null
          return (
            <span className="link-chip" title={`Same sheet in ${in_.map((p) => p.name).join(', ')}. Number, name and type stay in step.`}>
              <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M5 7l2-2 M4.2 5.6L3 6.8a1.7 1.7 0 0 0 2.4 2.4l1.2-1.2 M7.8 6.4L9 5.2a1.7 1.7 0 0 0-2.4-2.4L5.4 4" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
              {in_.map((p) => <b key={p.id} className={p.id === t.phase_id ? 'on' : ''}>{phaseShort(p)}</b>)}
            </span>
          )
        })()}
        {t.notes && descFor !== t.id && <button className="has-desc" title={`${t.notes}\n\nClick to edit`} onClick={() => setDescFor(t.id)}>≡</button>}
        {kind === 'sheet' && (
          <Pop className="type-pop" title="Sheet type" label={<span className="type-chip">{type?.name ?? 'Type'}</span>}>
            {(close) => (
              <div className="pm-types">
                {SHEET_TYPES.map((st) => (
                  <button key={st.id} className={`pm-item${st.id === t.sheet_type ? ' on' : ''}`} onClick={() => { onPatch(t, { sheet_type: st.id }); close() }}>
                    {st.name}{st.source === 'suggested' && <span className="pm-hint">suggested list</span>}
                  </button>
                ))}
                {type && type.checklist.length > 0 && (
                  <>
                    <div className="pm-sep" />
                    <button className="pm-item" onClick={() => {
                      const existing = new Set(childrenOf(tree, t.id).map((c) => c.title))
                      void onAddMany(type.checklist.filter((c) => !existing.has(c)).map((c, i) => ({
                        project_id: projectId, phase_id: t.phase_id, parent_id: t.id, kind: 'item', title: c, status: 'todo',
                        is_milestone: false, client_visible: false, sort_order: 100 + i, effort: null, start_date: null, due_date: null,
                      })))
                      expand(t.id); close()
                    }}>Add this type’s standard subtasks</button>
                  </>
                )}
              </div>
            )}
          </Pop>
        )}
        {noteCount && onOpenNotes && noteCount(t) > 0 && (
          <button className="note-chip" title={`${noteCount(t)} meeting note${noteCount(t) === 1 ? '' : 's'}: open the latest`} onClick={() => onOpenNotes(t)}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.5h5l2 2v7h-7z M4 5h4 M4 7h4 M4 9h2.5" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>
            {noteCount(t)}
          </button>
        )}
        {prog.total > 0 && <span className={`prog${prog.done === prog.total ? ' all' : ''}`} title={`${prog.done} of ${prog.total} done`}>{prog.done}/{prog.total}</span>}
        <TaskControls task={shown} people={people} phases={phases} isParent={parent} columnar
          onPatch={(c) => onPatch(t, c)} onDelete={() => onDrop(t.id)} />
        {firstOf(t) && seam([{ task: t, depth }], 'before')}
        {!(isOpen && kids.length) && seam([{ task: t, depth }, ...enders], 'after')}
      </li>,
      ...(descFor === t.id ? [
        <li key={`${t.id}-desc`} className="tdesc" style={{ paddingLeft: 40 + depth * 24 + 34 } as CSSProperties} onBlur={() => setDescFor(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); (e.target as HTMLElement).blur() } }}>
          <TextField multiline autoFocus value={t.notes ?? null} placeholder="Add a description…" className="tdesc-field"
            onSave={(v) => onPatch(t, { notes: v }, false)} />
        </li>,
      ] : []),
      ...(isOpen ? kids.flatMap((c, i): ReactNode[] => node(c, depth + 1, i === kids.length - 1 ? [{ task: t, depth }, ...enders] : [])) : []),
      ...(isOpen && kids.length === 0 ? [
        <li key={`${t.id}-add`} className="tree-add" style={{ paddingLeft: 40 + (depth + 1) * 24 }}>
          <button className="btn ghost" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ x: r.left, y: r.bottom + 2, target: t, only: 'add-inside' })
          }}>+ Add under {kind === 'sheet' ? 'sheet' : kind === 'section' ? 'section' : 'task'}</button>
        </li>,
      ] : []),
    ]
  }

  return (
    <>
      {carryPick && (
        <CarryPicker phase={phase} phases={phases}
          sheets={sheetsBefore(allRows, phases, phase).filter((x) => carryPick.mode === 'add' || !carryPick.sheet.sheet_link || x.sheet_link !== carryPick.sheet.sheet_link)}
          single={carryPick.mode === 'link'}
          onCancel={() => setCarryPick(null)}
          onPick={async (picked) => {
            if (carryPick.mode === 'link') { if (picked[0]) linkTo(carryPick.sheet, picked[0]) }
            else { await carryInto(picked, phase); if (folded.sheets) fold('sheets') }
            setCarryPick(null)
          }} />
      )}
      {planning && (
        <SheetPlanner
          onCancel={() => setPlanning(false)}
          onCreate={async (counts, autoNumber) => {
            const taken = new Set([...tree.byId.values()].filter((t) => t.kind === 'sheet' && t.sheet_number).map((t) => t.sheet_number!.toUpperCase()))
            const rows: Partial<Task>[] = []
            let order = top.reduce((m, t) => Math.max(m, t.sort_order), top.length - 1) + 1
            for (const st of SHEET_TYPES) {
              const n = counts[st.id] ?? 0
              if (!n) continue
              const numbers = autoNumber && st.series ? nextSheetNumbers(st.series, n, taken) : []
              for (let i = 0; i < n; i++) {
                const { sheet, items } = sheetRows({
                  projectId, phaseId: phase.id, number: numbers[i] ?? '', name: n > 1 ? `${st.name} ${i + 1}` : st.name,
                  typeId: st.id, start: phase.start_date, due: phase.end_date, assigneeId: null, sortOrder: order++,
                })
                rows.push(sheet, ...items)
              }
            }
            if (rows.length) await onAddMany(rows)
            setPlanning(false)
          }} />
      )}
      <ul className={`tlist${hint?.id === `end-${phase.id}` ? ' drop-end' : ''}`}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('li, input, textarea')) return
          e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, target: null })
        }}
        onDragOver={(e) => { if (dragging) { e.preventDefault(); setHint({ id: `end-${phase.id}`, place: 'after' }) } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHint(null) }}
        onDrop={(e) => { e.preventDefault(); setHint(null); dropRow(e, null, 'after') }}>
        {/* Tasks first, then sheets, each under a quiet heading (only when the phase has some). */}
        {/* Each group sits in its own block so one continuous bracket runs down its left side. */}
        {topTasks.length > 0 && (
          <li className="tgroup g-tasks"><ul className="tgroup-list">
            {groupHead('tasks', 'General Tasks', topTasks.length)}
            {!folded.tasks && topTasks.flatMap((t) => node(t, 0))}
          </ul></li>
        )}
        {topSheets.length > 0 && (
          <li className="tgroup g-sheets"><ul className="tgroup-list">
            {groupHead('sheets sheet-side', 'Sheets', topSheets.length)}
            {!folded.sheets && topSheets.flatMap((t) => node(t, 0))}
          </ul></li>
        )}
        {topManual.length > 0 && (
          <li className="tgroup g-manual"><ul className="tgroup-list">
            {groupHead('manual', 'Project Manual', topManual.length)}
            {!folded.manual && topManual.flatMap((t) => node(t, 0))}
          </ul></li>
        )}
        {top.length === 0 && !addingSheet && emptyNote && <li className="muted small empty-row">{emptyNote}</li>}
        {top.length === 0 && !addingSheet && !emptyNote && (
          <li className="muted small empty-row">
            <button className="btn ghost add-first" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, target: null }) }}>+ Add a task, sheet or spec section</button>
          </li>
        )}
        {addingSheet && (
          <AddSheetRow
            earlier={sheetsBefore(allRows, phases, phase)}
            phases={phases}
            onCancel={() => setAddingSheet(false)}
            onAdd={async (number, name, typeId, same) => {
              if (same) { await carryInto([same], phase); return }
              const { sheet, items } = sheetRows({
                projectId, phaseId: phase.id, number, name, typeId,
                start: phase.start_date, due: phase.end_date, assigneeId: null, sortOrder: top.reduce((m, t) => Math.max(m, t.sort_order), top.length - 1) + 1,
              })
              await onAddMany([sheet, ...items])
            }} />
        )}
      </ul>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}
          items={menu.only === 'add-inside' ? insideItems(menu.target!) : menu.only === 'seam' ? seamItems(menu.target!, menu.place ?? 'after')
            : menu.only === 'tasks' || menu.only === 'sheets' || menu.only === 'manual' ? menuItems(null, menu.only)
            : menuItems(menu.target)} />
      )}
    </>
  )

  /** Adding on a seam: siblings at that level, right there. */
  function seamItems(t: Task, place: Place): MenuItem[] {
    const k = kindOf(t)
    const parent = t.parent_id ? tree.byId.get(t.parent_id) ?? null : null
    const pk = parent ? kindOf(parent) : null
    const pasteLabel = clip?.mode === 'cut' ? 'Move here' : 'Paste here'
    const opts: MenuItem[] = !parent
      ? [
          { label: 'Task', run: () => addAt(t, place, 'task') },
          { label: 'Milestone', run: () => addAt(t, place, 'task', true) },
          { label: 'Sheet', run: () => addAt(t, place, 'sheet') },
          { label: 'Spec section', run: () => addAt(t, place, 'section') },
        ]
      : k === 'item' || pk === 'task'
        ? [{ label: 'Subtask', run: () => addAt(t, place, 'item') }]
        : [
            { label: 'Task', run: () => addAt(t, place, 'task') },
            { label: 'Subtask', run: () => addAt(t, place, 'item') },
          ]
    return [
      ...opts,
      ...(!parent ? ['sep' as const, { label: 'Sheets by type…', run: () => setPlanning(true) }, { label: 'Quick-add sheets by number…', run: () => setAddingSheet(true) }] : []),
      ...(clip ? ['sep' as const, { label: pasteLabel, run: () => paste(t, place) }] : []),
    ]
  }

  function insideItems(t: Task): MenuItem[] {
    const k = kindOf(t)
    return [
      ...(KIND_RANK[k] < 2 ? [{ label: 'Task', run: () => addAt(t, 'inside', 'task') }] : []),
      { label: 'Subtask', run: () => addAt(t, 'inside', 'item') },
      ...(readClip() ? ['sep' as const, { label: clip?.mode === 'cut' ? 'Move here' : 'Paste here', run: () => paste(t, 'inside') }] : []),
    ]
  }

  /** Carrying a sheet through phases: into the next phase, or linking it to an earlier phase's sheet. */
  function sheetLinkItems(t: Task): MenuItem[] {
    const next = nextPhaseOf(t)
    const inNext = next ? phasesOfSheet(allRows, phases, t).some((p) => p.id === next.id) : false
    const ph = phases.find((p) => p.id === t.phase_id)
    const earlier = ph ? sheetsBefore(allRows, phases, ph).filter((x) => !t.sheet_link || x.sheet_link !== t.sheet_link) : []
    return [
      'sep',
      ...(next ? [{ label: inNext ? `Already in ${next.name}` : `Carry into ${next.name}`, disabled: inNext, run: () => void carryInto([t], next) }] : []),
      ...(earlier.length ? [{ label: 'Same sheet as…', run: () => setCarryPick({ mode: 'link', sheet: t }) }] : []),
      ...(t.sheet_link && phasesOfSheet(allRows, phases, t).length > 1 ? [{ label: 'Unlink from other phases', run: () => onPatch(t, { sheet_link: null }) }] : []),
    ]
  }

  function menuItems(t: Task | null, first: WorkGroup = 'tasks'): MenuItem[] {
    const hasClip = Boolean(clip)
    const pasteLabel = clip?.mode === 'cut' ? 'Move here' : 'Paste'
    if (!t) {
      // Every kind of work can be started from here, so an empty group is never a dead end.
      // The group that was right-clicked comes first.
      const groups: Record<WorkGroup, MenuItem[]> = {
        tasks: [
          { label: 'Add general task', run: () => addAt(null, 'inside', 'task') },
          { label: 'Add milestone', run: () => addAt(null, 'inside', 'task', true) },
        ],
        sheets: [
          { label: 'Add sheet', run: () => addAt(null, 'inside', 'sheet') },
          { label: 'Add sheets by type…', run: () => setPlanning(true) },
          { label: 'Quick-add sheets by number…', run: () => setAddingSheet(true) },
          ...(sheetsBefore(allRows, phases, phase).length ? [{ label: 'Carry sheets from earlier phases…', run: () => setCarryPick({ mode: 'add' }) }] : []),
        ],
        manual: [
          { label: 'Add spec section', run: () => addAt(null, 'inside', 'section') },
        ],
      }
      const order: WorkGroup[] = [first, ...(['tasks', 'sheets', 'manual'] as WorkGroup[]).filter((g) => g !== first)]
      return [
        ...order.flatMap((g, i) => [...(i ? ['sep' as const] : []), ...groups[g]]),
        'sep',
        { label: pasteLabel, keys: 'Ctrl+V', disabled: !hasClip, run: () => paste(null, 'inside') },
      ]
    }
    if (many() && isSel(t.id)) {
      const n = sel.ids.size
      return [
        { label: `${n} selected`, disabled: true, run: () => {} },
        'sep',
        { label: 'Mark done', run: () => markMany('done') },
        { label: 'Mark not done', run: () => markMany('todo') },
        'sep',
        { label: 'Cut', keys: 'Ctrl+X', run: () => copyMany('cut') },
        { label: 'Copy', keys: 'Ctrl+C', run: () => copyMany('copy') },
        'sep',
        { label: 'Clear selection', keys: 'Esc', run: () => clearSelection() },
        { label: `Delete ${n} items`, keys: 'Del', danger: true, run: () => delMany() },
      ]
    }
    const k = kindOf(t)
    const holds = canHold(t)
    const topLevel = !t.parent_id
    const add: MenuItem[] = k === 'item'
      ? [{ label: 'Add subtask below', run: () => addAt(t, 'after', 'item') }]
      : [
          ...(topLevel ? [{ label: 'Add sheet below', run: () => addAt(t, 'after', 'sheet') }, { label: 'Add spec section below', run: () => addAt(t, 'after', 'section') }] : []),
          { label: 'Add task below', run: () => addAt(t, 'after', 'task') },
          ...(topLevel ? [{ label: 'Add milestone below', run: () => addAt(t, 'after', 'task', true) }] : []),
          ...(KIND_RANK[k] < 2 ? [{ label: 'Add task', run: () => addAt(t, 'inside', 'task') }] : []),
          { label: 'Add subtask', run: () => addAt(t, 'inside', 'item') },
        ]
    return [
      ...add,
      'sep',
      { label: 'Promote', keys: 'Ctrl+[', disabled: !canPromote(t), run: () => promoteRow(t) },
      { label: 'Demote', keys: 'Ctrl+]', disabled: !canDemote(tree, t), run: () => demoteRow(t) },
      'sep',
      { label: 'Cut', keys: 'Ctrl+X', run: () => copy(t, 'cut') },
      { label: 'Copy', keys: 'Ctrl+C', run: () => copy(t, 'copy') },
      { label: `${pasteLabel} below`, keys: 'Ctrl+V', disabled: !hasClip, run: () => paste(t, 'after') },
      ...(holds ? [{ label: `${pasteLabel} inside`, disabled: !hasClip, run: () => paste(t, 'inside') }] : []),
      { label: 'Duplicate', keys: 'Ctrl+D', run: () => duplicate(t) },
      ...(k === 'sheet' && topLevel ? sheetLinkItems(t) : []),
      'sep',
      { label: descFor === t.id ? 'Close description' : t.notes ? 'Edit description…' : 'Add description…', run: () => setDescFor(descFor === t.id ? null : t.id) },
      ...(onAddNote && k !== 'item' ? [
        'sep' as const,
        { label: t.is_milestone ? 'Add meeting notes' : 'Add notes', run: () => onAddNote(t) },
        ...(noteCount && onOpenNotes && noteCount(t) > 0 ? [{ label: `Open notes (${noteCount(t)})`, run: () => onOpenNotes(t) }] : []),
      ] : []),
      ...(presented && onTogglePresented && k !== 'item'
        ? ['sep' as const, { label: presented(t) ? 'Hide from presentation' : 'Show in presentation', run: () => onTogglePresented(t) }]
        : []),
      'sep',
      { label: 'Delete', keys: 'Del', danger: true, run: () => del(t) },
    ]
  }
}

/** Quick row for adding sheets one after another: number, name, type (guessed as you type). */
function AddSheetRow({ onAdd, onCancel, earlier, phases }: {
  onAdd: (number: string, name: string, typeId: string, sameAs: Task | null) => Promise<void>
  onCancel: () => void
  /** Sheets earlier phases have: a matching number offers to carry that sheet instead of making a new one. */
  earlier: Task[]
  phases: Phase[]
}) {
  const [number, setNumber] = useState('')
  const [useSame, setUseSame] = useState(true)
  const match = number.trim() ? earlier.find((t) => (t.sheet_number ?? '').toUpperCase() === number.trim().toUpperCase()) ?? null : null
  const matchPhase = match ? phases.find((p) => p.id === match.phase_id) : null
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState<string | null>(null) // null = follow the guess
  const [busy, setBusy] = useState(false)
  const guessed = guessSheetType(number, name)
  const type = typeId ?? guessed
  const st = sheetTypeById(type)

  async function submit() {
    if (!number.trim() && !name.trim()) return
    setBusy(true)
    await onAdd(number.trim(), name.trim(), type, match && useSame ? match : null)
    setBusy(false)
    setNumber(''); setName(''); setTypeId(null)
    document.getElementById('new-sheet-no')?.focus()
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); void submit() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <li className="add-sheet" onKeyDown={keys}>
      <input id="new-sheet-no" className="field boxed sheet-no-in mono" placeholder="A101" value={number} autoFocus onChange={(e) => setNumber(e.target.value)} />
      <input className="field boxed" placeholder="Sheet name, e.g. Reflected ceiling plan" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="field boxed" value={type} onChange={(e) => setTypeId(e.target.value)} title="Sheet type">
        {SHEET_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button className="btn primary" disabled={busy || (!number.trim() && !name.trim())} onClick={submit}>Add sheet</button>
      <button className="btn ghost" onClick={onCancel}>Done</button>
      {match && (
        <label className="inline-check small add-sheet-same">
          <input type="checkbox" checked={useSame} onChange={(e) => setUseSame(e.target.checked)} />
          Same sheet as {match.sheet_number} {match.title}{matchPhase ? ` in ${matchPhase.name}` : ''}
        </label>
      )}
      <span className="muted small add-sheet-hint">
        {st && st.checklist.length ? `Adds ${st.checklist.length} standard subtasks${st.source === 'suggested' ? ' (suggested list)' : ' (from your Asana projects)'}. ` : ''}
        Enter adds and starts the next; Esc closes.
      </span>
    </li>
  )
}

/** Plan a phase's sheet set by type: how many of each, then create them all with their checklists. */
function SheetPlanner({ onCreate, onCancel }: {
  onCreate: (counts: Record<string, number>, autoNumber: boolean) => Promise<void>
  onCancel: () => void
}) {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [autoNumber, setAutoNumber] = useState(true)
  const [busy, setBusy] = useState(false)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const set = (id: string, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.min(50, n)) }))

  return (
    <div className="sheet-planner" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}>
      <div className="sp-head">
        <div>
          <strong>Add sheets by type</strong>
          <span className="muted small"> · How many of each do you expect? Each sheet gets its type’s standard subtasks.</span>
        </div>
        <button className="icon-btn" title="Close (Esc)" onClick={onCancel}>×</button>
      </div>
      <div className="sp-grid">
        {SHEET_TYPES.filter((t) => t.id !== 'other').map((t) => {
          const n = counts[t.id] ?? 0
          return (
            <div key={t.id} className={`sp-type${n ? ' on' : ''}`}>
              <span className="sp-name">
                {t.name}
                <span className="pm-hint">{t.checklist.length ? `${t.checklist.length} subtasks${t.source === 'suggested' ? ' · suggested' : ''}` : 'no subtasks'}{t.series ? ` · ${t.series}xx` : ''}</span>
              </span>
              <span className="stepper">
                <button type="button" onClick={() => set(t.id, n - 1)} disabled={n === 0} aria-label={`Fewer ${t.name}`}>−</button>
                <input type="number" min={0} max={50} value={n || ''} placeholder="0" aria-label={`${t.name} count`}
                  onChange={(e) => set(t.id, Number(e.target.value) || 0)} />
                <button type="button" onClick={() => set(t.id, n + 1)} aria-label={`More ${t.name}`}>+</button>
              </span>
            </div>
          )
        })}
      </div>
      <div className="sp-foot">
        <label className="inline-check">
          <input type="checkbox" checked={autoNumber} onChange={(e) => setAutoNumber(e.target.checked)} />
          Number them in the usual series (A101, A501…), skipping numbers already used
        </label>
        <span className="grow" />
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!total || busy}
          onClick={async () => { setBusy(true); await onCreate(counts, autoNumber); setBusy(false) }}>
          {total ? `Add ${total} sheet${total === 1 ? '' : 's'}` : 'Add sheets'}
        </button>
      </div>
    </div>
  )
}

/** Pick sheets from earlier phases: several to carry into this phase, or one to link a sheet to. */
function CarryPicker({ phase, phases, sheets, single, onPick, onCancel }: {
  phase: Phase
  phases: Phase[]
  sheets: Task[]
  single: boolean
  onPick: (picked: Task[]) => Promise<void>
  onCancel: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(() => (single ? new Set() : new Set(sheets.map((t) => t.id))))
  const [busy, setBusy] = useState(false)
  const short = (id: string | null | undefined) => { const p = phases.find((x) => x.id === id); return p ? phaseShort(p) : '' }
  const chosen = sheets.filter((t) => picked.has(t.id))
  return (
    <Modal title={single ? 'Same sheet as…' : `Carry sheets into ${phase.name}`} onClose={onCancel}
      footer={
        <>
          <span className="muted small grow">{single ? 'Takes that sheet’s number, name and type; they stay in step from now on.' : 'Each keeps its number and name; add this phase’s work under it.'}</span>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!chosen.length || busy} onClick={async () => { setBusy(true); try { await onPick(chosen) } finally { setBusy(false) } }}>
            {single ? 'Link' : `Carry ${chosen.length} sheet${chosen.length === 1 ? '' : 's'}`}
          </button>
        </>
      }>
      <ul className="pick-list carry">
        {sheets.map((t) => (
          <li key={t.id}>
            <label className={picked.has(t.id) ? '' : 'off'}>
              <input type={single ? 'radio' : 'checkbox'} name="carry-pick" checked={picked.has(t.id)} onChange={(e) => {
                if (single) { setPicked(new Set([t.id])); return }
                const next = new Set(picked)
                if (e.target.checked) next.add(t.id); else next.delete(t.id)
                setPicked(next)
              }} />
              <span className="mono carry-no">{t.sheet_number || '—'}</span>
              <span>{t.title}<span className="pick-hint">{typeHint(t)}from {short(t.phase_id)}</span></span>
            </label>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
