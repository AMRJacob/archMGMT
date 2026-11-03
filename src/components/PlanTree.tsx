import { useEffect, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import ContextMenu, { type MenuItem } from './ContextMenu.tsx'
import { TextField } from './fields.tsx'
import { remove } from '../lib/data.ts'
import {
  branchOf, canDemote, canHold, canPromote, clearClip, CLIP_EVENT, cloneRows, demote, isWithin, kindUnder, moveTo,
  placeAmong, promote, readClip, saveClip, slotFor, type Change, type Clip, type Place,
} from '../lib/treeEdit.ts'
import { MilestoneMark, Pop, TaskControls } from './TaskChips.tsx'
import { addDays, nextMonday } from '../lib/dates.ts'
import { guessSheetType, nextSheetNumbers, SHEET_TYPES, sheetRows, sheetTypeById } from '../lib/sheetTypes.ts'
import { childrenOf, descendants, isItem, kindOf, progressOf, rolledDates, scheduledChildren, type Tree } from '../lib/tree.ts'
import { assigneesOf, assignPatch } from '../lib/assignees.ts'
import { KIND_RANK, type Person, type Phase, type Task, type TaskKind } from '../lib/types.ts'

const ghostName = (t: Task) =>
  t.is_milestone ? 'Milestone name' : ({ sheet: 'Sheet name', view: 'View name', task: 'Task name', item: 'Checklist item' } as const)[kindOf(t)]

/** The row being dragged, shared by every phase's tree so rows can move between phases. */
let dragging: { id: string } | null = null

type MenuState = { x: number; y: number; target: Task | null; only?: 'add-inside' }

/**
 * One phase's work as a tree: sheets → views → tasks → items (checklist lines / info).
 * Every row is edited in place. Right-click anywhere to add at that spot, move rows by dragging the grip,
 * promote/demote with the arrows (or Tab / Shift+Tab), and cut/copy/paste with the menu or Ctrl+X/C/V.
 */
export default function PlanTree({
  phase, tree, phases, people, projectId, onPatch, onPatchMany, onDrop, onAdd, onAddMany,
}: {
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
  const [newId, setNewId] = useState<string | null>(null)
  const [addingSheet, setAddingSheet] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [hint, setHint] = useState<{ id: string; place: Place } | null>(null)
  const [clip, setClip] = useState<Clip | null>(() => readClip())

  useEffect(() => {
    const sync = () => setClip(readClip())
    window.addEventListener(CLIP_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(CLIP_EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])

  const top = childrenOf(tree, null).filter((t) => t.phase_id === phase.id)
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
    const k = kind === 'sheet' && parent ? kindUnder(parent, 'view') : kindUnder(parent, kind)
    const base = parent ? rolledDates(tree, parent) : null
    const s = base?.start ?? (ph.start_date > nextMonday() ? ph.start_date : nextMonday())
    const dated = k !== 'item'
    const created = await onAdd({
      id: crypto.randomUUID(), project_id: projectId, phase_id: ph.id, parent_id: parent?.id ?? null, kind: k,
      title: '',
      sheet_number: null, sheet_type: k === 'sheet' ? 'other' : null,
      ...assignPatch(parent ? assigneesOf(parent) : []),
      start_date: dated && !milestone ? (k === 'sheet' ? ph.start_date : s) : null,
      due_date: dated ? (milestone ? ph.end_date : k === 'sheet' ? ph.end_date : base?.due ?? addDays(s, 13)) : null,
      estimated_hours: null, effort: k === 'item' ? null : k === 'view' ? 1 : 2, status: 'todo',
      is_milestone: milestone, client_visible: milestone, sort_order: sortOrders[0],
    })
    expand(parent?.id)
    setNewId(created.id)
    setSelected(created.id)
  }

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

  const promoteRow = (t: Task) => { const c = promote(tree, t); if (c.length) onPatchMany(c) }
  const demoteRow = (t: Task) => { const c = demote(tree, t); if (c.length) { onPatchMany(c); expand(c[0].next.parent_id) } }

  /** Keys on a selected row. Tab / Shift+Tab also work while editing its title, like Asana. */
  const rowKeys = (t: Task) => (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest('input, textarea, select')
    if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) promoteRow(t); else demoteRow(t); return }
    if (typing) return
    const mod = e.ctrlKey || e.metaKey
    const k = e.key.toLowerCase()
    if (mod && k === 'c') { e.preventDefault(); copy(t, 'copy') }
    else if (mod && k === 'x') { e.preventDefault(); copy(t, 'cut') }
    else if (mod && k === 'v') { e.preventDefault(); paste(t, 'after') }
    else if (mod && k === 'd') { e.preventDefault(); duplicate(t) }
    else if (e.key === 'Delete') { e.preventDefault(); del(t) }
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
  )
  const rowProps = (t: Task, className: string, depth: number) => ({
    className: `${className}${selected === t.id ? ' selected' : ''}${cutIds.has(t.id) ? ' cutting' : ''}${hint?.id === t.id ? ` drop-${hint.place}` : ''}`,
    style: { paddingLeft: 40 + depth * 24, '--indent': `${40 + depth * 24}px` } as CSSProperties,
    tabIndex: -1,
    onFocus: () => setSelected(t.id),
    onMouseDown: (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('input, button, select, textarea, .pop')) (e.currentTarget as HTMLElement).focus() },
    onKeyDown: rowKeys(t),
    onContextMenu: (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return // keep the browser menu for text
      e.preventDefault(); e.stopPropagation()
      setSelected(t.id)
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

  const node = (t: Task, depth: number): ReactNode[] => {
    const kind = kindOf(t)
    if (isItem(t)) {
      return [
        <li key={t.id} {...rowProps(t, `irow${t.status === 'done' ? ' done' : ''}`, depth)}>
          {grip(t)}
          <input type="checkbox" checked={t.status === 'done'} title="Done"
            onChange={(e) => onPatch(t, { status: e.target.checked ? 'done' : 'todo' }, false)} />
          <div className="trow-title">{title(t)}</div>
          <button className="icon-btn" title="Remove item" onClick={() => onDrop(t.id)}>×</button>
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
          title={isOpen ? 'Collapse' : kids.length ? `Show ${kids.length} under it` : 'Add views, tasks or items under it'}>
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
        {kind === 'view' && <span className="kind-tag">View</span>}
        <div className="trow-title">{title(t, kind === 'sheet' ? 'sheet-title' : '')}</div>
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
                    }}>Add this type’s checklist</button>
                  </>
                )}
              </div>
            )}
          </Pop>
        )}
        {prog.total > 0 && <span className={`prog${prog.done === prog.total ? ' all' : ''}`} title={`${prog.done} of ${prog.total} done`}>{prog.done}/{prog.total}</span>}
        <TaskControls task={shown} people={people} phases={phases} isParent={parent}
          onPatch={(c) => onPatch(t, c)} onDelete={() => onDrop(t.id)} />
      </li>,
      ...(isOpen ? kids.flatMap((c): ReactNode[] => node(c, depth + 1)) : []),
      ...(isOpen ? [
        <li key={`${t.id}-add`} className="tree-add" style={{ paddingLeft: 40 + (depth + 1) * 24 }}>
          <button className="btn ghost" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({ x: r.left, y: r.bottom + 2, target: t, only: 'add-inside' })
          }}>+ Add under {kind === 'sheet' ? 'sheet' : kind === 'view' ? 'view' : 'task'}</button>
        </li>,
      ] : []),
    ]
  }

  return (
    <>
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
        {top.flatMap((t) => node(t, 0))}
        {top.length === 0 && !addingSheet && <li className="muted small empty-row">Nothing in this phase yet. Right-click here, or use the buttons below, to add sheets, tasks and milestones.</li>}
        {addingSheet && (
          <AddSheetRow
            onCancel={() => setAddingSheet(false)}
            onAdd={async (number, name, typeId) => {
              const { sheet, items } = sheetRows({
                projectId, phaseId: phase.id, number, name, typeId,
                start: phase.start_date, due: phase.end_date, assigneeId: null, sortOrder: top.reduce((m, t) => Math.max(m, t.sort_order), top.length - 1) + 1,
              })
              await onAddMany([sheet, ...items])
            }} />
        )}
      </ul>
      <div className="phase-actions-left"
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, target: null }) }}>
        <button className="btn ghost" onClick={() => setAddingSheet(true)}>+ Sheet</button>
        <button className="btn ghost" onClick={() => setPlanning(true)}>+ Sheets by type</button>
        <button className="btn ghost" onClick={() => addAt(null, 'inside', 'task')}>+ Task</button>
        <span className="muted small tree-tip">Right-click a row to add next to it, move it or copy it</span>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}
          items={menu.only ? insideItems(menu.target!) : menuItems(menu.target)} />
      )}
    </>
  )

  function insideItems(t: Task): MenuItem[] {
    const k = kindOf(t)
    return [
      ...(k === 'sheet' ? [{ label: 'View', run: () => addAt(t, 'inside', 'view') }] : []),
      ...(KIND_RANK[k] < 3 ? [{ label: 'Task', run: () => addAt(t, 'inside', 'task') }] : []),
      { label: 'Checklist item', run: () => addAt(t, 'inside', 'item') },
      ...(readClip() ? ['sep' as const, { label: clip?.mode === 'cut' ? 'Move here' : 'Paste here', run: () => paste(t, 'inside') }] : []),
    ]
  }

  function menuItems(t: Task | null): MenuItem[] {
    const hasClip = Boolean(clip)
    const pasteLabel = clip?.mode === 'cut' ? 'Move here' : 'Paste'
    if (!t) {
      return [
        { label: 'Add sheet', run: () => addAt(null, 'inside', 'sheet') },
        { label: 'Add sheets by type…', run: () => setPlanning(true) },
        { label: 'Add task', run: () => addAt(null, 'inside', 'task') },
        { label: 'Add milestone', run: () => addAt(null, 'inside', 'task', true) },
        'sep',
        { label: pasteLabel, keys: 'Ctrl+V', disabled: !hasClip, run: () => paste(null, 'inside') },
      ]
    }
    const k = kindOf(t)
    const holds = canHold(t)
    const topLevel = !t.parent_id
    const add: MenuItem[] = k === 'item'
      ? [{ label: 'Add item below', run: () => addAt(t, 'after', 'item') }]
      : [
          ...(topLevel ? [{ label: 'Add sheet below', run: () => addAt(t, 'after', 'sheet') }] : []),
          { label: `Add ${k === 'view' ? 'view' : 'task'} below`, run: () => addAt(t, 'after', k === 'view' ? 'view' : 'task') },
          ...(topLevel ? [{ label: 'Add milestone below', run: () => addAt(t, 'after', 'task', true) }] : []),
          ...(k === 'sheet' ? [{ label: 'Add view inside', run: () => addAt(t, 'inside', 'view') }] : []),
          ...(KIND_RANK[k] < 3 ? [{ label: 'Add task inside', run: () => addAt(t, 'inside', 'task') }] : []),
          { label: 'Add checklist item inside', run: () => addAt(t, 'inside', 'item') },
        ]
    return [
      ...add,
      'sep',
      { label: 'Promote', keys: 'Shift+Tab', disabled: !canPromote(t), run: () => promoteRow(t) },
      { label: 'Demote', keys: 'Tab', disabled: !canDemote(tree, t), run: () => demoteRow(t) },
      'sep',
      { label: 'Cut', keys: 'Ctrl+X', run: () => copy(t, 'cut') },
      { label: 'Copy', keys: 'Ctrl+C', run: () => copy(t, 'copy') },
      { label: `${pasteLabel} below`, keys: 'Ctrl+V', disabled: !hasClip, run: () => paste(t, 'after') },
      ...(holds ? [{ label: `${pasteLabel} inside`, disabled: !hasClip, run: () => paste(t, 'inside') }] : []),
      { label: 'Duplicate', keys: 'Ctrl+D', run: () => duplicate(t) },
      'sep',
      { label: 'Delete', keys: 'Del', danger: true, run: () => del(t) },
    ]
  }
}

/** Quick row for adding sheets one after another: number, name, type (guessed as you type). */
function AddSheetRow({ onAdd, onCancel }: { onAdd: (number: string, name: string, typeId: string) => Promise<void>; onCancel: () => void }) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState<string | null>(null) // null = follow the guess
  const [busy, setBusy] = useState(false)
  const guessed = guessSheetType(number, name)
  const type = typeId ?? guessed
  const st = sheetTypeById(type)

  async function submit() {
    if (!number.trim() && !name.trim()) return
    setBusy(true)
    await onAdd(number.trim(), name.trim(), type)
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
      <span className="muted small add-sheet-hint">
        {st && st.checklist.length ? `Adds ${st.checklist.length} checklist items${st.source === 'suggested' ? ' (suggested list)' : ' (from your Asana projects)'}. ` : ''}
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
          <span className="muted small"> · How many of each do you expect? Each sheet gets its type’s checklist.</span>
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
                <span className="pm-hint">{t.checklist.length ? `${t.checklist.length} checks${t.source === 'suggested' ? ' · suggested' : ''}` : 'no checklist'}{t.series ? ` · ${t.series}xx` : ''}</span>
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
