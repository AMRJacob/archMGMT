import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { TextField } from './fields.tsx'
import { Pop, TaskControls } from './TaskChips.tsx'
import { addDays, nextMonday } from '../lib/dates.ts'
import { guessSheetType, nextSheetNumbers, SHEET_TYPES, sheetRows, sheetTypeById } from '../lib/sheetTypes.ts'
import { childrenOf, isItem, kindOf, progressOf, rolledDates, scheduledChildren, type Tree } from '../lib/tree.ts'
import type { Person, Phase, Task, TaskKind } from '../lib/types.ts'

/**
 * One phase's work as a tree: sheets → views → tasks → items (checklist lines / info).
 * Every row is edited in place; ▸ opens what's under it and the "+" buttons add the next level down.
 */
export default function PlanTree({
  phase, tree, phases, people, projectId, onPatch, onDrop, onAdd, onAddMany,
}: {
  phase: Phase
  tree: Tree
  phases: Phase[]
  people: Person[]
  projectId: string
  onPatch: (t: Task, changes: Partial<Task>, record?: boolean) => void
  onDrop: (id: string) => void
  onAdd: (row: Partial<Task>) => Promise<Task>
  onAddMany: (rows: Partial<Task>[]) => Promise<void>
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [newId, setNewId] = useState<string | null>(null)
  const [addingSheet, setAddingSheet] = useState(false)
  const [planning, setPlanning] = useState(false)

  const top = childrenOf(tree, null).filter((t) => t.phase_id === phase.id)
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const expand = (id: string) => setOpen((o) => new Set([...o, id]))

  async function addChild(parent: Task | null, kind: TaskKind, milestone = false) {
    const base = parent ? rolledDates(tree, parent) : null
    const s = base?.start ?? (phase.start_date > nextMonday() ? phase.start_date : nextMonday())
    const dated = kind !== 'item'
    const created = await onAdd({
      project_id: projectId, phase_id: phase.id, parent_id: parent?.id ?? null, kind,
      title: milestone ? 'New milestone' : kind === 'item' ? 'New item' : kind === 'view' ? 'New view' : 'New task',
      assignee_id: parent?.assignee_id ?? null,
      start_date: dated && !milestone ? s : null,
      due_date: dated ? (milestone ? phase.end_date : base?.due ?? addDays(s, 13)) : null,
      estimated_hours: null, effort: kind === 'item' ? null : kind === 'view' ? 1 : 2, status: 'todo',
      is_milestone: milestone, client_visible: milestone, sort_order: childrenOf(tree, parent?.id ?? null).length,
    })
    if (parent) expand(parent.id)
    setNewId(created.id)
  }

  /** Title field with "new row" behaviour: focused on creation, Esc removes it if it wasn't named. */
  const title = (t: Task, className = '') => (
    <TextField value={t.title} className={className} autoFocus={t.id === newId}
      onSave={(v) => { if (v) onPatch(t, { title: v }, false); if (t.id === newId) setNewId(null) }}
      onEscape={t.id === newId ? () => { setNewId(null); onDrop(t.id) } : undefined} />
  )

  const node = (t: Task, depth: number): ReactNode[] => {
    const kind = kindOf(t)
    const indent = { paddingLeft: 40 + depth * 24 }
    if (isItem(t)) {
      return [
        <li key={t.id} className={`irow${t.status === 'done' ? ' done' : ''}`} style={indent}>
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
      <li key={t.id} className={`trow k-${kind}${t.status === 'done' ? ' done' : ''}`} style={indent}>
        <button className={`twist${isOpen ? ' open' : ''}${kids.length ? '' : ' empty'}`} onClick={() => toggle(t.id)}
          title={isOpen ? 'Collapse' : kids.length ? `Show ${kids.length} under it` : 'Add views, tasks or items under it'}>
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button className={`tick ${t.status}`} title={t.status === 'done' ? 'Mark not done' : 'Mark done'}
          onClick={() => onPatch(t, { status: t.status === 'done' ? 'todo' : 'done' })}>
          {t.status === 'done' ? '✓' : ''}
        </button>
        {t.is_milestone && <span className="diamond" title="Milestone" />}
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
                        project_id: projectId, phase_id: phase.id, parent_id: t.id, kind: 'item', title: c, status: 'todo',
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
          {kind === 'sheet' && <button className="btn ghost" onClick={() => addChild(t, 'view')}>+ View</button>}
          <button className="btn ghost" onClick={() => addChild(t, 'task')}>+ Task</button>
          <button className="btn ghost" onClick={() => addChild(t, 'item')}>+ Checklist item</button>
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
            let order = top.length
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
      <ul className="tlist">
        {top.flatMap((t) => node(t, 0))}
        {top.length === 0 && !addingSheet && <li className="muted small empty-row">Nothing in this phase yet. Add sheets for production, or tasks and milestones.</li>}
        {addingSheet && (
          <AddSheetRow
            onCancel={() => setAddingSheet(false)}
            onAdd={async (number, name, typeId) => {
              const { sheet, items } = sheetRows({
                projectId, phaseId: phase.id, number, name, typeId,
                start: phase.start_date, due: phase.end_date, assigneeId: null, sortOrder: top.length,
              })
              await onAddMany([sheet, ...items])
            }} />
        )}
      </ul>
      <div className="phase-actions-left">
        <button className="btn ghost" onClick={() => setAddingSheet(true)}>+ Sheet</button>
        <button className="btn ghost" onClick={() => setPlanning(true)}>+ Sheets by type</button>
        <button className="btn ghost" onClick={() => addChild(null, 'task')}>+ Task</button>
        <button className="btn ghost" onClick={() => addChild(null, 'task', true)}>+ Milestone</button>
      </div>
    </>
  )
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
