/** Dates are stored as ISO strings (YYYY-MM-DD) and handled in UTC to avoid time-zone drift. */

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function parseISO(iso: string): Date {
  return new Date(iso + 'T00:00:00Z')
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toISO(d)
}

export function today(): string {
  const now = new Date()
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

/** The Monday on or after today. */
export function nextMonday(): string {
  const t = today()
  const dow = parseISO(t).getUTCDay() // 0 Sun … 6 Sat
  return addDays(t, (8 - dow) % 7 || 0)
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return parseISO(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function minDate(dates: (string | null | undefined)[]): string | null {
  const v = dates.filter((d): d is string => Boolean(d)).sort()
  return v[0] ?? null
}

export function maxDate(dates: (string | null | undefined)[]): string | null {
  const v = dates.filter((d): d is string => Boolean(d)).sort()
  return v[v.length - 1] ?? null
}
