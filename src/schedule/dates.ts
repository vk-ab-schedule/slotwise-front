import { formatInZone, localDate, zonedDateTimeToIso } from '../availability/time'

export function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function weekStart(day: string) {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

export function dayLabel(day: string, options: Intl.DateTimeFormatOptions) {
  return formatInZone(`${day}T00:00:00Z`, 'UTC', options)
}

export function dateRange(day: string, days: number, timeZone: string) {
  return { from: zonedDateTimeToIso(day, '00:00', timeZone), to: zonedDateTimeToIso(addDays(day, days), '00:00', timeZone) }
}

export function timeRange(start: string, end: string, zone: string) {
  const time = { hour: '2-digit', minute: '2-digit' } as const
  const first = formatInZone(start, zone, time)
  const last = formatInZone(end, zone, time)
  return localDate(start, zone) === localDate(end, zone)
    ? `${first}–${last}`
    : `${first} – ${dayLabel(localDate(end, zone), { day: 'numeric', month: 'short' })}, ${last}`
}
