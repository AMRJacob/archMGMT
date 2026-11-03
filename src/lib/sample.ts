import { addDays, nextMonday, today } from './dates.ts'
import { defaultPhaseRows } from './phases.ts'
import { sheetRows } from './sheetTypes.ts'
import type { TableName } from './types.ts'

/**
 * Sample data for trying the app before real projects are entered. Every sample row is tagged
 * (see data.ts) so it can be removed later without touching anything you've added.
 * Each seed only ADDS rows: it never edits or deletes what is already there.
 */

export type Row = { id: string } & Record<string, unknown>
export type Store = Record<TableName, Row[]>
type Tag = (id: string) => void

const newId = () => crypto.randomUUID()

function taskStatus(start: string | null, due: string | null, milestone: boolean) {
  const t = today()
  if (due && due < t) return 'done'
  if (!milestone && start && start <= t) return 'in_progress'
  return 'todo'
}

/** Seed 1: the original sample project (kept so existing browsers stay consistent). */
export function seedV1(s: Store, tag: Tag) {
  const people: Row[] = [
    ['Sample Principal', 'SP', 'Principal', 40],
    ['Sample Project Architect', 'PA', 'Project Architect', 40],
    ['Sample Architect', 'SA', 'Architect', 40],
    ['Sample Designer', 'SD', 'Designer', 40],
    ['Sample Intern', 'SI', 'Intern', 20],
  ].map(([name, initials, role, hours]) => ({
    id: newId(), name, initials, role, kind: 'staff', company: null, discipline: null,
    weekly_hours: hours, color: null, active: true,
  }))
  people.push({
    id: newId(), name: 'Sample MEP Engineer', initials: 'ME', role: null, kind: 'consultant',
    company: 'Sample MEP Consultants', discipline: 'MEP', weekly_hours: 0, color: null, active: true,
  })

  const start = addDays(nextMonday(), -7 * 10)
  const project: Row = {
    id: newId(), number: '2026-001', name: 'Sample Library Renovation', client: 'Sample County Library',
    status: 'active', pm_id: people[1].id, color: null, start_date: null, end_date: null,
    notes: 'Sample project. Edit or delete it freely.', created_at: new Date().toISOString(),
  }
  const phases = defaultPhaseRows(project.id, start).map((p) => ({ id: newId(), ...p }) as Row)
  const [pre, sd, dd] = phases
  const t = (phase: Row, title: string, who: number, off: number, len: number, hours: number | null, milestone = false): Row => {
    const st = milestone ? null : addDays(phase.start_date as string, off)
    const due = addDays(phase.start_date as string, off + len)
    return {
      id: newId(), project_id: project.id, phase_id: phase.id, title, assignee_id: people[who].id,
      start_date: st, due_date: due, estimated_hours: hours, status: taskStatus(st, due, milestone),
      is_milestone: milestone, client_visible: milestone, sort_order: 0,
    }
  }
  const tasks: Row[] = [
    t(pre, 'Existing conditions survey', 2, 0, 9, 24),
    t(pre, 'Program verification with owner', 1, 7, 14, 16),
    t(sd, 'Floor plan options', 3, 0, 20, 60),
    t(sd, 'Owner SD review', 1, 41, 0, null, true),
    t(dd, 'Enlarged plans and sections', 2, 0, 35, 80),
    t(dd, 'MEP coordination set', 5, 14, 28, null),
    t(dd, 'Outline specifications', 4, 21, 21, 30),
    t(dd, 'Owner DD review', 1, 55, 0, null, true),
  ]

  const add = (table: TableName, rows: Row[]) => {
    s[table].push(...rows)
    rows.forEach((r) => tag(r.id))
  }
  add('people', people)
  add('projects', [project])
  add('phases', phases)
  add('tasks', tasks)
}

/** Seed 2: a full sample office (7 staff, 3 consultants) and a spread of projects at different phases. */
export function seedV2(s: Store, tag: Tag) {
  const M = nextMonday()

  const person = (name: string, attrs: Partial<Row>): string => {
    const found = s.people.find((p) => p.name === name)
    if (found) return found.id
    const row: Row = {
      id: newId(), name, initials: null, role: null, kind: 'staff', company: null, discipline: null,
      weekly_hours: 40, color: null, active: true, ...attrs,
    }
    s.people.push(row)
    tag(row.id)
    return row.id
  }
  const P = {
    principal: person('Sample Principal', { initials: 'SP', role: 'Principal' }),
    pm: person('Sample Project Manager', { initials: 'PM', role: 'Project Manager' }),
    pa: person('Sample Project Architect', { initials: 'PA', role: 'Project Architect' }),
    arch: person('Sample Architect', { initials: 'SA', role: 'Architect' }),
    des: person('Sample Designer', { initials: 'SD', role: 'Designer' }),
    jr: person('Sample Junior Designer', { initials: 'JD', role: 'Junior Designer' }),
    intern: person('Sample Intern', { initials: 'SI', role: 'Intern', weekly_hours: 20 }),
    struct: person('Sample Structural Engineer', { initials: 'SE', kind: 'consultant', company: 'Sample Structural Co.', discipline: 'Structural', weekly_hours: 0 }),
    mep: person('Sample MEP Engineer', { initials: 'ME', kind: 'consultant', company: 'Sample MEP Consultants', discipline: 'MEP', weekly_hours: 0 }),
    civil: person('Sample Civil Engineer', { initials: 'CE', kind: 'consultant', company: 'Sample Civil Group', discipline: 'Civil', weekly_hours: 0 }),
  }
  type Who = keyof typeof P
  // [title, who, start offset (days from phase start), length (days), hours] or milestone: [title, who, offset]
  type TaskSpec = [string, Who, number, number, number | null] | [string, Who, number]

  const addTasks = (projectId: string, phase: Row | undefined, specs: TaskSpec[]) => {
    if (!phase) return
    const existing = new Set(s.tasks.filter((t) => t.project_id === projectId).map((t) => t.title))
    for (const spec of specs) {
      if (existing.has(spec[0])) continue
      const milestone = spec.length === 3
      const ps = phase.start_date as string
      const st = milestone ? null : addDays(ps, spec[2])
      const due = milestone ? addDays(ps, spec[2]) : addDays(ps, spec[2] + (spec[3] as number))
      const row: Row = {
        id: newId(), project_id: projectId, phase_id: phase.id, title: spec[0], assignee_id: P[spec[1]],
        start_date: st, due_date: due, estimated_hours: milestone ? null : spec[4], status: taskStatus(st, due, milestone),
        is_milestone: milestone, client_visible: milestone, sort_order: 0,
      }
      s.tasks.push(row)
      tag(row.id)
    }
  }

  const project = (attrs: Partial<Row>, start: string) => {
    const row: Row = {
      id: newId(), number: null, name: 'Sample project', client: null, status: 'active', pm_id: P.pm,
      color: null, start_date: null, end_date: null, notes: 'Sample project.', created_at: new Date().toISOString(), ...attrs,
    }
    s.projects.push(row)
    tag(row.id)
    const phases = defaultPhaseRows(row.id, start).map((p) => ({ id: newId(), ...p }) as Row)
    s.phases.push(...phases)
    phases.forEach((p) => tag(p.id))
    return { id: row.id, phase: (name: string) => phases.find((p) => p.name === name) }
  }

  // --- Library: extend the original sample project, if it's still there ---
  const lib = s.projects.find((p) => p.name === 'Sample Library Renovation')
  if (lib) {
    const ph = (name: string) => s.phases.find((p) => p.project_id === lib.id && p.name === name)
    addTasks(lib.id, ph('Predesign'), [['Owner kickoff meeting', 'pm', 2]])
    addTasks(lib.id, ph('Schematic Design'), [['Massing and exterior studies', 'jr', 7, 21, 40], ['SD cost estimate', 'pm', 28, 10, 12]])
    addTasks(lib.id, ph('Design Development'), [
      ['Structural coordination', 'struct', 7, 28, null], ['Interior finish selections', 'des', 14, 28, 36], ['DD cost estimate', 'pm', 42, 7, 10],
    ])
    addTasks(lib.id, ph('Construction Documents'), [
      ['CD sheet set setup', 'jr', 0, 7, 16], ['Wall sections and details', 'arch', 0, 56, 120], ['Door hardware and schedules', 'intern', 14, 28, 40],
      ['Project manual', 'pa', 28, 42, 60], ['Consultant 90% coordination', 'pm', 49, 7, 8],
      ['90% owner review', 'pm', 63], ['Permit submission', 'pa', 76], ['Issue for bid', 'pm', 83],
    ])
    addTasks(lib.id, ph('Bidding'), [['Pre-bid meeting', 'pm', 7], ['Addenda', 'pa', 7, 14, 16], ['Bid opening', 'pm', 21]])
    addTasks(lib.id, ph('Construction Administration'), [
      ['Submittal reviews', 'pa', 7, 180, 120], ['Monthly site visits and field reports', 'pm', 0, 270, 54], ['Substantial completion', 'pm', 250],
    ])
  }

  // --- Fire station: three weeks into CDs ---
  const fire = project({ number: '2026-004', name: 'Sample Fire Station No. 3', client: 'Sample City', pm_id: P.pa }, addDays(M, -21 * 7))
  addTasks(fire.id, fire.phase('Predesign'), [['Site and program study', 'pa', 0, 21, 40]])
  addTasks(fire.id, fire.phase('Schematic Design'), [['Apparatus bay layout options', 'arch', 0, 28, 50], ['Owner SD approval', 'pa', 41]])
  addTasks(fire.id, fire.phase('Design Development'), [['DD plans and elevations', 'arch', 0, 49, 90], ['Owner DD approval', 'pa', 55]])
  addTasks(fire.id, fire.phase('Construction Documents'), [
    ['Plans and elevations', 'pa', 0, 42, 100], ['Apparatus bay details', 'arch', 7, 35, 90], ['Specifications', 'pa', 28, 42, 50],
    ['Structural CDs', 'struct', 0, 56, null], ['MEP CDs', 'mep', 0, 56, null], ['Civil site plan', 'civil', 0, 49, null],
    ['Life safety and code plan', 'jr', 14, 21, 40], ['Interior elevations', 'des', 21, 28, 56],
    ['95% owner review', 'pa', 70], ['Permit submission', 'pa', 80],
  ])
  addTasks(fire.id, fire.phase('Bidding'), [['Bid opening', 'pa', 21]])

  // --- Clinic: two weeks into SD ---
  const clinic = project({ number: '2026-007', name: 'Sample Clinic Addition', client: 'Sample Health Partners', pm_id: P.pm }, addDays(M, -6 * 7))
  addTasks(clinic.id, clinic.phase('Predesign'), [['Existing building survey', 'intern', 0, 14, 20], ['Programming workshop', 'principal', 14, 7, 12]])
  addTasks(clinic.id, clinic.phase('Schematic Design'), [
    ['Space planning', 'des', 0, 28, 70], ['Code analysis', 'jr', 0, 14, 24], ['Site plan options', 'jr', 7, 21, 30],
    ['Exterior concepts', 'principal', 14, 21, 16], ['Owner SD review', 'pm', 40],
  ])
  addTasks(clinic.id, clinic.phase('Design Development'), [['DD drawings', 'arch', 0, 49, 60], ['Owner DD review', 'pm', 55]])

  // --- Office fit-out: eight weeks into CA ---
  const office = project({ number: '2025-012', name: 'Sample Office Fit-out', client: 'Sample Holdings LLC', pm_id: P.pm }, addDays(M, -42 * 7))
  addTasks(office.id, office.phase('Construction Documents'), [['Permit set', 'arch', 0, 70, 120], ['Issue for bid', 'pm', 83]])
  addTasks(office.id, office.phase('Construction Administration'), [
    ['Submittal reviews', 'arch', 0, 120, 40], ['Weekly site visits', 'pm', 0, 280, 40], ['RFI responses', 'intern', 14, 120, 24], ['Substantial completion', 'pm', 180],
  ])

  // --- Master plan: a pursuit ---
  const plan = project({ number: '2026-010', name: 'Sample Campus Master Plan', client: 'Sample College', status: 'pursuit', pm_id: P.principal }, addDays(M, -7))
  addTasks(plan.id, plan.phase('Predesign'), [['Proposal and fee', 'principal', 0, 10, 16], ['Interview preparation', 'pm', 14, 7, 8], ['Interview', 'principal', 21]])

  // --- Time off, so capacity dips show up ---
  const off = (who: Who, from: number, days: number, note: string) => {
    const row: Row = { id: newId(), person_id: P[who], start_date: addDays(M, from), end_date: addDays(M, from + days - 1), note }
    s.time_off.push(row)
    tag(row.id)
  }
  off('des', 14, 5, 'Sample vacation')
  off('arch', 42, 5, 'Sample time off')
}

/** Seed 5: example sheets (with their checklists) in the sample library project's CD phase. */
export function seedSheets(s: Store, tag: Tag) {
  const lib = s.projects.find((p) => p.name === 'Sample Library Renovation')
  const cd = lib && s.phases.find((p) => p.project_id === lib.id && p.name === 'Construction Documents')
  if (!lib || !cd) return
  const who = (name: string) => (s.people.find((p) => p.name === name)?.id as string | undefined) ?? null
  const cs = cd.start_date as string
  const add = (rows: Row[]) => { for (const r of rows) { s.tasks.push(r); tag(r.id) } }
  const sheet = (number: string, name: string, typeId: string, person: string, off: number, len: number, done = 0) => {
    const { sheet: sh, items } = sheetRows({
      projectId: lib.id, phaseId: cd.id, number, name, typeId, start: addDays(cs, off), due: addDays(cs, off + len),
      assigneeId: who(person), sortOrder: 0,
    })
    items.forEach((it, i) => { if (i < done) it.status = 'done' })
    add([sh as unknown as Row, ...(items as unknown as Row[])])
    return sh.id
  }
  sheet('G000', 'Cover sheet', 'cover', 'Sample Junior Designer', 0, 10, 2)
  sheet('A101', 'Architectural site plan', 'site', 'Sample Architect', 0, 28, 3)
  sheet('A102', 'Floor plan: reference', 'plan-ref', 'Sample Project Architect', 7, 35, 4)
  sheet('A104', 'Reflected ceiling plan', 'rcp', 'Sample Designer', 14, 28)
  // A sheet with views, and tasks under a view, to show the full hierarchy.
  const a401 = sheet('A401', 'Enlarged plans & interior elevations', 'enlarged', 'Sample Designer', 21, 35)
  const view = (title: string, off: number, len: number, tasks: [string, string][]) => {
    const v: Row = {
      id: crypto.randomUUID(), project_id: lib.id, phase_id: cd.id, parent_id: a401, kind: 'view', sheet_number: null, sheet_type: null,
      title, assignee_id: who('Sample Designer'), start_date: addDays(cs, off), due_date: addDays(cs, off + len), estimated_hours: null,
      effort: 1, status: 'todo', is_milestone: false, client_visible: false, sort_order: 0, notes: null,
    }
    add([v])
    tasks.forEach(([t, person], i) => add([{
      id: crypto.randomUUID(), project_id: lib.id, phase_id: cd.id, parent_id: v.id, kind: 'task', sheet_number: null, sheet_type: null,
      title: t, assignee_id: who(person), start_date: addDays(cs, off + i * 4), due_date: addDays(cs, off + i * 4 + 6), estimated_hours: null,
      effort: 1, status: 'todo', is_milestone: false, client_visible: false, sort_order: i, notes: null,
    }]))
  }
  view('Toilet rooms: enlarged plan and elevations', 21, 14, [['Draft enlarged plan', 'Sample Designer'], ['Interior elevations with mounting heights', 'Sample Intern']])
  view('Check-in desk', 28, 14, [['Plan and elevations', 'Sample Designer'], ['Coordinate power and data', 'Sample Junior Designer']])
}
