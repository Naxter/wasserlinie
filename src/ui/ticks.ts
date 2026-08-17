import { formatMonth, formatMonthYear, formatShortDate, formatYear, startOfDay } from './format'

const DAY = 86_400_000

export interface Tick {
  t: number
  label: string | null
}

/**
 * Marks for the time bar at whatever scale it is showing.
 *
 * The slider spans a month in the live view and twenty-six years in the long
 * one, so the unit has to change with it — a tick per day would be nine
 * thousand elements and an unreadable smear of labels.
 */
export function ticksFor(start: number, end: number, narrow = false): Tick[] {
  const span = end - start
  const maxLabels = narrow ? 5 : 11
  if (span > 3 * 365 * DAY) return byYear(start, end, maxLabels)
  if (span > 100 * DAY) return byMonth(start, end, maxLabels)
  return byDay(start, end, maxLabels)
}

/** The coarsest stride that keeps the labels down to `max`. */
function strideFor(count: number, max: number, choices: number[]): number {
  return choices.find((c) => count / c <= max) ?? choices[choices.length - 1]!
}

function byYear(start: number, end: number, maxLabels: number): Tick[] {
  const first = new Date(start).getFullYear() + 1
  const last = new Date(end).getFullYear()
  const years: number[] = []
  for (let y = first; y <= last; y++) years.push(y)
  const every = strideFor(years.length, maxLabels, [1, 2, 5, 10, 25])
  // Label round years — 2005, 2010, 2015 — not every fifth year counted from
  // wherever the record happens to start.
  return years.map((y) => {
    const t = new Date(y, 0, 1).getTime()
    return { t, label: y % every === 0 ? formatYear(t) : null }
  })
}

function byMonth(start: number, end: number, maxLabels: number): Tick[] {
  const from = new Date(start)
  const out: Tick[] = []
  const months: number[] = []
  const cursor = new Date(from.getFullYear(), from.getMonth() + 1, 1)
  while (cursor.getTime() < end) {
    months.push(cursor.getTime())
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const every = strideFor(months.length, maxLabels, [1, 2, 3, 6, 12])
  for (const t of months) {
    const month = new Date(t).getMonth()
    // Quarters rather than an arbitrary offset, and January carries the year
    // so the reader is never lost between them.
    const label = month % every === 0 ? (month === 0 ? formatMonthYear(t) : formatMonth(t)) : null
    out.push({ t, label })
  }
  return out
}

function byDay(start: number, end: number, maxLabels: number): Tick[] {
  const days: number[] = []
  for (let t = startOfDay(start) + DAY; t < end; t += DAY) days.push(t)
  const every = strideFor(days.length, maxLabels, [1, 2, 3, 7, 14, 28])
  return days.map((t, i) => ({ t, label: i % every === 0 ? formatShortDate(t) : null }))
}
