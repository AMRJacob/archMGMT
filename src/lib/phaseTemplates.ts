import type { MilestoneType } from './milestones.ts'

/**
 * Suggested starting work for each phase, offered as checkboxes when a phase is set up.
 *
 * The phase scopes follow AIA B101 basic services (Schematic Design §3.2, Design Development §3.3,
 * Construction Documents §3.4, Procurement §3.5, Construction §3.6) and the AIA Best Practices
 * phase checklists; Predesign follows common owner predesign scopes (programming, existing-conditions
 * and hazardous-materials surveys, site analysis). Tasks marked `on` are ticked by default; the rest
 * are offered for projects that need them (e.g. renovation-only items).
 *
 * `at` places a task inside its phase as fractions of the phase length: [start, end].
 */

export interface TemplateTask {
  title: string
  at: [number, number]
  on: boolean
  milestone?: boolean
  /** For milestones: who it's for (see MILESTONE_TYPES). */
  mtype?: MilestoneType
  /** Shown under the title in the setup dialog. */
  hint?: string
  effort?: 1 | 2 | 3
}

export interface TemplateSheet {
  /** A sheet type id from sheetTypes.ts. */
  type: string
  count: number
  on: boolean
}

export interface PhaseTemplate {
  key: string
  match: RegExp
  blurb: string
  tasks: TemplateTask[]
  sheets: TemplateSheet[]
}

export const PHASE_TEMPLATES: PhaseTemplate[] = [
  {
    key: 'predesign',
    match: /pre-?design|programming|feasib/i,
    blurb: 'Learn what’s there and what’s needed: program, existing conditions, site and budget.',
    tasks: [
      { title: 'Owner kickoff meeting', at: [0, 0.05], on: true, effort: 1 },
      { title: 'Programming / space needs', at: [0.05, 0.6], on: true, hint: 'Rooms, sizes, adjacencies and goals with the owner' },
      { title: 'Existing conditions survey and measured drawings', at: [0.05, 0.45], on: true, hint: 'Field verify and model what’s there' },
      { title: 'Site visit and photo documentation', at: [0.05, 0.15], on: true, effort: 1 },
      { title: 'Topographic and boundary survey', at: [0.05, 0.5], on: true, hint: 'Usually the owner’s surveyor or civil' },
      { title: 'Geotechnical investigation', at: [0.1, 0.6], on: false, hint: 'Soil borings and report' },
      { title: 'Phase I environmental site assessment', at: [0.1, 0.6], on: true, hint: 'Environmental report on the property' },
      { title: 'Hazardous materials survey', at: [0.1, 0.5], on: false, hint: 'Asbestos, lead paint, PCBs, mercury (renovations)' },
      { title: 'Abatement scope and coordination', at: [0.5, 0.9], on: false, hint: 'From the hazardous materials survey' },
      { title: 'Zoning and code analysis', at: [0.2, 0.6], on: true },
      { title: 'Utility availability', at: [0.2, 0.6], on: false },
      { title: 'Budget and cost analysis', at: [0.5, 0.85], on: true },
      { title: 'Feasibility study / predesign report', at: [0.6, 0.95], on: false },
      { title: 'Owner predesign approval', at: [1, 1], on: true, milestone: true, mtype: 'owner' },
    ],
    sheets: [
      { type: 'site', count: 1, on: false },
      { type: 'plan-ref', count: 1, on: false },
    ],
  },
  {
    key: 'sd',
    match: /schematic|\bsd\b/i,
    blurb: 'Test ideas: site plan, plans, massing and a first cost estimate (B101 §3.2).',
    tasks: [
      { title: 'Review program, codes and owner information', at: [0, 0.15], on: true, effort: 1 },
      { title: 'Site plan options', at: [0.05, 0.45], on: true },
      { title: 'Floor plan options', at: [0.05, 0.6], on: true },
      { title: 'Massing and exterior studies', at: [0.3, 0.8], on: true },
      { title: 'Preliminary building systems and materials', at: [0.4, 0.85], on: true, hint: 'With structural and MEP' },
      { title: 'Sustainability and energy goals', at: [0.1, 0.5], on: false },
      { title: 'Consultant coordination meeting', at: [0.3, 0.35], on: true, effort: 1 },
      { title: 'Internal SD design review', at: [0.75, 0.75], on: false, milestone: true, mtype: 'internal' },
      { title: 'SD cost estimate', at: [0.8, 0.95], on: true },
      { title: 'Owner SD review', at: [1, 1], on: true, milestone: true, mtype: 'owner' },
    ],
    sheets: [
      { type: 'cover', count: 1, on: true },
      { type: 'site', count: 1, on: true },
      { type: 'plan-ref', count: 1, on: true },
      { type: 'elevations', count: 1, on: true },
      { type: 'sections', count: 1, on: false },
      { type: 'renderings', count: 1, on: true },
    ],
  },
  {
    key: 'dd',
    match: /design dev|\bdd\b/i,
    blurb: 'Fix the design: coordinated systems, outline specs and an updated estimate (B101 §3.3).',
    tasks: [
      { title: 'Consultant coordination (structural, MEP, civil)', at: [0, 0.9], on: true },
      { title: 'Code review update', at: [0.1, 0.4], on: true },
      { title: 'Interior finishes and material selections', at: [0.3, 0.8], on: true },
      { title: 'Door, window and partition types', at: [0.3, 0.8], on: true },
      { title: 'Outline specifications', at: [0.5, 0.95], on: true },
      { title: 'Meeting with code official', at: [0.4, 0.45], on: false, effort: 1 },
      { title: 'Update cost estimate', at: [0.85, 0.97], on: true },
      { title: 'Owner DD review', at: [1, 1], on: true, milestone: true, mtype: 'owner' },
    ],
    sheets: [
      { type: 'cover', count: 1, on: true },
      { type: 'code', count: 1, on: true },
      { type: 'site', count: 1, on: true },
      { type: 'plan-ref', count: 1, on: true },
      { type: 'rcp', count: 1, on: true },
      { type: 'roof', count: 1, on: true },
      { type: 'elevations', count: 1, on: true },
      { type: 'sections', count: 1, on: true },
      { type: 'wall-sections', count: 1, on: true },
      { type: 'enlarged', count: 1, on: false },
      { type: 'doors', count: 1, on: false },
    ],
  },
  {
    key: 'cd',
    match: /construction doc|\bcd\b/i,
    blurb: 'The permit and bid set: drawings, project manual and QA reviews (B101 §3.4).',
    tasks: [
      { title: 'Project manual / specifications', at: [0.2, 0.95], on: true },
      { title: 'Consultant coordination', at: [0, 0.9], on: true },
      { title: '50% QA/QC review', at: [0.45, 0.5], on: true, effort: 1 },
      { title: '50% CD set to consultants', at: [0.5, 0.5], on: false, milestone: true, mtype: 'coordination' },
      { title: '90% QA/QC review', at: [0.85, 0.9], on: true, effort: 1 },
      { title: 'Final cost estimate', at: [0.85, 0.97], on: false },
      { title: 'Permit submittal', at: [0.9, 0.95], on: true, effort: 1 },
      { title: 'Respond to plan review comments', at: [0.95, 1], on: false },
      { title: 'Permit issued', at: [1, 1], on: false, milestone: true, mtype: 'agency' },
      { title: 'Owner CD approval', at: [1, 1], on: true, milestone: true, mtype: 'owner' },
    ],
    sheets: [
      { type: 'cover', count: 1, on: true },
      { type: 'code', count: 1, on: true },
      { type: 'general', count: 1, on: true },
      { type: 'partition', count: 1, on: true },
      { type: 'site', count: 1, on: true },
      { type: 'plan-ref', count: 1, on: true },
      { type: 'plan-dim', count: 1, on: true },
      { type: 'rcp', count: 1, on: true },
      { type: 'roof', count: 1, on: true },
      { type: 'elevations', count: 2, on: true },
      { type: 'sections', count: 1, on: true },
      { type: 'wall-sections', count: 2, on: true },
      { type: 'enlarged', count: 2, on: true },
      { type: 'details', count: 3, on: true },
      { type: 'doors', count: 1, on: true },
      { type: 'frames', count: 1, on: true },
      { type: 'finish', count: 1, on: true },
      { type: 'material-legend', count: 1, on: false },
      { type: 'millwork', count: 1, on: false },
      { type: 'equipment', count: 1, on: false },
      { type: 'ffe', count: 1, on: false },
    ],
  },
  {
    key: 'bidding',
    match: /bid|procure|negotiat/i,
    blurb: 'Get it priced and awarded: questions, addenda and bid review (B101 §3.5).',
    tasks: [
      { title: 'Issue bid documents', at: [0, 0.03], on: true, milestone: true, mtype: 'contract' },
      { title: 'Pre-bid meeting', at: [0.2, 0.25], on: true, effort: 1 },
      { title: 'Answer bidder questions', at: [0.1, 0.75], on: true, effort: 1 },
      { title: 'Addenda', at: [0.3, 0.8], on: true },
      { title: 'Substitution requests', at: [0.3, 0.75], on: false, effort: 1 },
      { title: 'Bid opening', at: [0.8, 0.8], on: true, milestone: true, mtype: 'contract' },
      { title: 'Bid evaluation and recommendation', at: [0.8, 0.95], on: true },
      { title: 'Contract award', at: [1, 1], on: true, milestone: true, mtype: 'contract' },
    ],
    sheets: [],
  },
  {
    key: 'ca',
    match: /construction admin|construction phase|\bca\b/i,
    blurb: 'Through construction to closeout: submittals, RFIs, site visits and punch lists (B101 §3.6).',
    tasks: [
      { title: 'Preconstruction meeting', at: [0, 0.02], on: true, effort: 1 },
      { title: 'Submittal and shop drawing review', at: [0.02, 0.7], on: true },
      { title: 'RFIs', at: [0.02, 0.95], on: true, effort: 1 },
      { title: 'Site observation visits and reports', at: [0.02, 0.95], on: true, effort: 1 },
      { title: 'Pay application review', at: [0.05, 1], on: true, effort: 1 },
      { title: 'Change orders and ASIs', at: [0.1, 0.95], on: true, effort: 1 },
      { title: 'Substantial completion and punch list', at: [0.9, 0.95], on: true },
      { title: 'Substantial completion', at: [0.93, 0.93], on: true, milestone: true, mtype: 'contract' },
      { title: 'Closeout: warranties, O&M manuals, record drawings', at: [0.93, 1], on: true },
      { title: 'Final completion', at: [1, 1], on: true, milestone: true, mtype: 'contract' },
    ],
    sheets: [],
  },
]

export function templateFor(phaseName: string): PhaseTemplate | null {
  return PHASE_TEMPLATES.find((t) => t.match.test(phaseName)) ?? null
}
