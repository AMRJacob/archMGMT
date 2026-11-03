/** Kinds of milestone, each with its own colour on the schedule. The legend only lists the kinds in use. */
export type MilestoneType = 'owner' | 'internal' | 'coordination' | 'agency' | 'contract'

export const MILESTONE_TYPES: { value: MilestoneType; label: string; color: string; hint: string }[] = [
  { value: 'owner', label: 'Owner', color: '#d9480f', hint: 'Owner reviews, approvals and meetings' },
  { value: 'internal', label: 'Internal', color: '#495057', hint: 'Our own deadlines and reviews' },
  { value: 'coordination', label: 'Coordination', color: '#1c7ed6', hint: 'Consultant hand-offs and deadlines' },
  { value: 'agency', label: 'Agency / permit', color: '#7048e8', hint: 'Code officials, permits and approvals' },
  { value: 'contract', label: 'Bid / construction', color: '#2b8a3e', hint: 'Bids, award, completion dates' },
]

export const milestoneType = (v: string | null | undefined) => MILESTONE_TYPES.find((m) => m.value === v) ?? null
/** Colour for a milestone diamond; untyped milestones keep the plain ink colour. */
export const milestoneColor = (v: string | null | undefined, fallback: string) => milestoneType(v)?.color ?? fallback
