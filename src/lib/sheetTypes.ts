import type { Effort, TaskStatus } from './types.ts'

/**
 * Sheet types and the checklist each one starts with. Adding a sheet of a type creates its checklist
 * (as items under the sheet). Lists marked source 'asana' were built from the standard per-sheet
 * subtasks in AMR's Asana projects (CAW Watershed Management and UARM Medical Sciences Building);
 * lists marked 'suggested' had no subtasks in those projects and are starter lists to edit.
 */

export interface SheetType {
  id: string
  name: string
  /** Typical sheet number prefixes, used to guess the type from a number like "A104". */
  match: RegExp
  effort: Effort
  /** Numbering series for auto-numbered sheets: series + two digits (G0 → G000, A1 → A101, FF0 → FF001). */
  series?: string
  source: 'asana' | 'suggested'
  checklist: string[]
}

export const SHEET_TYPES: SheetType[] = [
  {
    id: 'cover', series: 'G0', name: 'Cover sheet', match: /^G-?0*0$|cover/i, effort: 1, source: 'asana',
    checklist: ['Owner name, title and logo', 'Project name and subtitle', 'Project location and site address', 'Drawing index with sheet numbers', 'Consultant team list (architecture, MEP, structural, civil)'],
  },
  {
    id: 'code', series: 'G0', name: 'Code information / life safety plan', match: /^G-?0*1$|life safety|code/i, effort: 2, source: 'asana',
    checklist: ['Research applicable codes (Arkansas building code)', 'Identify occupancy classification', 'Show occupancy types colour coded for occupant load', 'Add egress paths', 'Locate fire extinguishers and radii', 'Show fire access area'],
  },
  {
    id: 'general', series: 'G0', name: 'General information', match: /^[GA]-?0*[2-9]$|^A-?00[1-9]$|general/i, effort: 1, source: 'suggested',
    checklist: ['General notes', 'Abbreviations and symbols legend', 'Project data / building summary'],
  },
  {
    id: 'renderings', series: 'G0', name: 'Renderings / views', match: /render|exterior views|interior views/i, effort: 1, source: 'suggested',
    checklist: ['Select views', 'Render and place images', 'Label views'],
  },
  {
    id: 'partition', series: 'A0', name: 'Partition types', match: /partition|wall types/i, effort: 1, source: 'suggested',
    checklist: ['Partition type details', 'Fire / acoustic ratings and UL references', 'Partition general notes'],
  },
  {
    id: 'site', series: 'A1', name: 'Architectural site plan', match: /^A-?1-?0*1$|site plan/i, effort: 2, source: 'asana',
    checklist: ['Change view to hidden line', 'Survey coordination', 'Show paving joints', 'Show sidewalks and stairs', 'Site drainage (e.g. trench drains)', 'Call out landscape features and reference landscape', 'Show site lighting and reference electrical', 'Fences and gates', 'Screen walls for mechanical equipment', 'Signage (monument sign?)', 'Add project north arrow', 'Add true north arrow'],
  },
  {
    id: 'plan-ref', series: 'A1', name: 'Floor plan: reference', match: /reference|^A-?1-?0*2$/i, effort: 3, source: 'asana',
    checklist: ['Room names and numbers', 'Door tags', 'Wall tags', 'Frame type tags', 'Callouts for enlarged plans', 'Wall section tags', 'Building section tags', 'Elevation tags', 'Interior elevation tags', 'Millwork elevation tags', 'Gridlines', 'Reference legend for plan elements', 'Organize annotations so elements don’t cross', 'Turn off ADA clearances in this view', 'Add project north and true north arrows'],
  },
  {
    id: 'plan-dim', series: 'A1', name: 'Floor plan: dimensioned', match: /dimension|^A-?1-?0*3$/i, effort: 2, source: 'asana',
    checklist: ['Wall dimensions to faces of studs', 'Overall exterior dimensions', 'Masonry dimensions with openings, if present', 'Exterior footprint dimensions at outside face of stud, tied to structure', 'Double check that all walls are dimensioned', 'Make sure all wall types are labeled', 'Show ADA clearances where needed'],
  },
  {
    id: 'rcp', series: 'A1', name: 'Reflected ceiling plan', match: /ceiling|rcp|^A-?1-?0*4$/i, effort: 2, source: 'asana',
    checklist: ['Ceiling material tags with heights', 'Keep ceiling tags consistent with the sheet legend and interior material legend', 'Room labels', 'Show headers and furr-downs', 'Tag ceiling details (drapery pocket, transitions…)', 'Window treatment locations', 'Light fixture types and locations (use actual fixture families)', 'Supply and return diffusers', 'Access panels in hard ceilings at equipment', 'Exterior soffit materials and light fixtures', 'Coordinate lights and exit signs with electrical'],
  },
  {
    id: 'roof', series: 'A1', name: 'Roof plan', match: /roof plan|^A-?1-?0*5$/i, effort: 2, source: 'asana',
    checklist: ['Roof detail tags', 'Building section tags', 'Wall section tags', 'Roof material callouts', 'Roof slope tags', 'Roof drain locations', 'Gutters and downspouts', 'Walk pads', 'Rooftop equipment', 'Screen wall locations and sections', 'Dimension all overhangs', 'Roof flow calculations', 'Call out phasing (especially existing conditions)', 'Roofing general notes', 'Ladders where necessary', 'Fall protection where necessary', 'Add project north arrow'],
  },
  {
    id: 'elevations', series: 'A2', name: 'Exterior elevations', match: /exterior elevation|^A-?2-?0*1$/i, effort: 2, source: 'asana',
    checklist: ['Material tags or keynotes with legend', 'Gridlines (pulled above roof)', 'Levels (pulled to the side of the building)', 'Building section tags', 'Wall section tags', 'Visible light fixtures', 'Downspout outlets or conductor heads with downspouts', 'Grade cut line and earth hatch (filled region)', 'Darken profile lines', 'Expansion and control joints in masonry'],
  },
  {
    id: 'sections', series: 'A2', name: 'Building sections', match: /building section|^A-?2-?0*2$/i, effort: 2, source: 'asana',
    checklist: ['Room names', 'Show continuous envelope with insulation', 'Tag wall sections if present', 'Gridlines (pulled above view)', 'Tag frame types if not shown in other views', 'Show structure (clean up if necessary)', 'Show MEP (clean up if necessary)'],
  },
  {
    id: 'wall-sections', series: 'A3', name: 'Wall sections', match: /wall section|^A-?3/i, effort: 3, source: 'asana',
    checklist: ['Detail footing to top of wall', 'Detail top of wall to roof'],
  },
  {
    id: 'enlarged', series: 'A4', name: 'Enlarged plans & interior elevations', match: /enlarged|interior elevation|^A-?4/i, effort: 3, source: 'asana',
    checklist: ['Add a view for each room or wall to show (e.g. toilet rooms, break room, check-in desk)'],
  },
  {
    id: 'details', series: 'A5', name: 'Details', match: /detail|^A-?5/i, effort: 2, source: 'suggested',
    checklist: ['Lay out detail grid', 'Draft details referenced from plans, sections and elevations', 'Check every detail callout points to a detail', 'Keynotes coordinated with the project manual'],
  },
  {
    id: 'doors', series: 'A6', name: 'Door schedule, types & details', match: /door|^A-?6-?0*1$/i, effort: 2, source: 'asana',
    checklist: ['Door schedule', 'Door types (use auto schedule where possible)', 'Door general notes', 'Door hardware general notes'],
  },
  {
    id: 'frames', series: 'A6', name: 'Frame types', match: /frame|^A-?6-?0*2$/i, effort: 2, source: 'asana',
    checklist: ['AL and HM frame types (typical door)', 'AL frame types: exterior', 'AL frame types: interior', 'HM frame types: exterior', 'HM frame types: interior'],
  },
  {
    id: 'finish', series: 'A7', name: 'Finish schedule & plans', match: /finish/i, effort: 2, source: 'asana',
    checklist: ['Sheet setup', 'Floor plan finish materials', 'Fill in legends and schedules'],
  },
  {
    id: 'material-legend', series: 'A7', name: 'Material legend', match: /material legend/i, effort: 1, source: 'suggested',
    checklist: ['List materials with tags and descriptions', 'Coordinate tags with plans, elevations and the project manual'],
  },
  {
    id: 'equipment', series: 'A7', name: 'Special equipment / appliances', match: /equipment|appliance/i, effort: 1, source: 'suggested',
    checklist: ['Equipment layout and clearances', 'Equipment schedule', 'Coordinate utilities with MEP'],
  },
  {
    id: 'millwork', series: 'A7', name: 'Casework & millwork details', match: /millwork|casework/i, effort: 2, source: 'asana',
    checklist: ['Add a view for each room with millwork (plan and elevations)', 'Millwork sections and details'],
  },
  {
    id: 'ffe', series: 'FF0', name: 'FF&E plan', match: /^FF|ff&e|furniture/i, effort: 2, source: 'suggested',
    checklist: ['Furniture layout', 'Equipment and storage layout', 'FF&E schedule / tags'],
  },
  {
    id: 'other', name: 'Other', match: /$^/, effort: 2, source: 'suggested',
    checklist: [],
  },
]

export const sheetTypeById = (id: string | null | undefined) => SHEET_TYPES.find((t) => t.id === id) ?? null

/** Best guess at a sheet's type from its number and name (e.g. "A104", "Reflected ceiling plan"). */
export function guessSheetType(number: string, name: string): string {
  const n = number.trim().toUpperCase(), t = name.trim()
  // Names are more specific than numbers, so try them first.
  for (const st of SHEET_TYPES) if (t && st.match.test(t)) return st.id
  for (const st of SHEET_TYPES) if (n && st.match.test(n)) return st.id
  return 'other'
}

/** Rows for a new sheet of a type and its checklist. Ids are made here so items can point at the sheet. */
export function sheetRows(opts: {
  projectId: string; phaseId: string | null; number: string; name: string; typeId: string
  start: string | null; due: string | null; assigneeId: string | null; sortOrder: number
}) {
  const type = sheetTypeById(opts.typeId) ?? sheetTypeById('other')!
  const sheetId = crypto.randomUUID()
  const sheet = {
    id: sheetId, project_id: opts.projectId, phase_id: opts.phaseId, parent_id: null, kind: 'sheet' as const,
    sheet_number: opts.number || null, sheet_type: type.id, title: opts.name || type.name,
    assignee_id: opts.assigneeId, assignee_ids: opts.assigneeId ? [opts.assigneeId] : [], start_date: opts.start, due_date: opts.due, estimated_hours: null,
    effort: type.effort, status: 'todo' as TaskStatus, is_milestone: false, client_visible: false, sort_order: opts.sortOrder, notes: null,
  }
  const items = type.checklist.map((title, i) => ({
    id: crypto.randomUUID(), project_id: opts.projectId, phase_id: opts.phaseId, parent_id: sheetId, kind: 'item' as const,
    sheet_number: null, sheet_type: null, title, assignee_id: null, start_date: null, due_date: null, estimated_hours: null,
    effort: null, status: 'todo' as TaskStatus, is_milestone: false, client_visible: false, sort_order: i, notes: null,
  }))
  return { sheet, items }
}

/**
 * The next free sheet numbers in a series, skipping numbers already used.
 * Series start at 00 for G0 (cover = G000), otherwise at 01 (A101, A501, FF001).
 */
export function nextSheetNumbers(series: string, count: number, taken: Set<string>): string[] {
  const out: string[] = []
  for (let n = series === 'G0' ? 0 : 1; out.length < count && n < 100; n++) {
    const num = `${series}${String(n).padStart(2, '0')}`
    if (!taken.has(num.toUpperCase())) { out.push(num); taken.add(num.toUpperCase()) }
  }
  return out
}
