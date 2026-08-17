const ZONE = 'Europe/Berlin'

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONE })
const shortDateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', timeZone: ZONE })
const timeFmt = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: ZONE })
const weekdayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: ZONE })
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'short', timeZone: ZONE })
const monthYearFmt = new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit', timeZone: ZONE })

export const formatMonth = (t: number): string => monthFmt.format(t).replace('.', '')
export const formatMonthYear = (t: number): string => monthYearFmt.format(t).replace('.', '')
export const formatYear = (t: number): string => String(new Date(t).getFullYear())

export const formatDate = (t: number): string => dateFmt.format(t)
export const formatShortDate = (t: number): string => shortDateFmt.format(t)
export const formatTime = (t: number): string => timeFmt.format(t)
export const formatWeekday = (t: number): string => weekdayFmt.format(t).replace('.', '')

export function formatCm(value: number): string {
  return Math.round(value).toLocaleString('de-DE')
}

export function formatLead(hours: number): string {
  const h = Math.round(hours)
  return h < 24 ? `+${h} h` : `+${Math.floor(h / 24)} d ${h % 24} h`
}

/** Local midnight (Berlin) at or before `t`. */
export function startOfDay(t: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(t)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const d = new Date(t)
  return t - hour * 3_600_000 - minute * 60_000 - d.getUTCSeconds() * 1000 - d.getUTCMilliseconds()
}
