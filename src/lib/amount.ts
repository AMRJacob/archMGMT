/** Reads "$4.25m", "4,250,000", "850k" or "12,500 sf" as a number. */
export function parseAmount(raw: string): number | null | 'bad' {
  const t = raw.trim().toLowerCase().replace(/[$,\s]|sf|sq\.? ?ft\.?|ft2/g, '')
  if (!t) return null
  const m = /^(-?\d*\.?\d+)([km])?$/.exec(t)
  if (!m) return 'bad'
  return Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1)
}


/** Dollars: whole dollars for budgets, cents when asked (e.g. cost per SF). */
export const money = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })

export const area = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} SF`

/** Building types offered on a project (anything else can be typed under Other). */
export const BUILDING_TYPES = [
  'Education (K–12)', 'Higher education', 'Office', 'Healthcare', 'Laboratory / research', 'Civic / government',
  'Public safety', 'Library', 'Recreation / community', 'Housing (multifamily)', 'Supportive housing',
  'Hospitality', 'Retail', 'Religious', 'Industrial / utility', 'Mixed use', 'Interiors / tenant fit-out',
]
