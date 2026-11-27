import type { components } from '../api/schema'
import { localDate, localTime, zonedDateTimeToIso } from './time'

export type CalendarSession = Pick<components['schemas']['PlanningSessionResponse'],
  'id' | 'name' | 'startsAt' | 'endsAt' | 'timeZone' | 'workingDays' | 'workingDayStart' | 'workingDayEnd' | 'collectionEndsAt' | 'collectionStatus'>

export type Window = { startsAt: string; endsAt: string }
export const weekDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

export const mondayOf = (date: string) => shiftDate(date, -weekday(date))

export function overlap(left: Window, right: Window): Window | null {
  const start = Math.max(Date.parse(left.startsAt), Date.parse(right.startsAt))
  const end = Math.min(Date.parse(left.endsAt), Date.parse(right.endsAt))
  return start < end ? { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() } : null
}

export function workingWindows(session: CalendarSession): Window[] {
  const result: Window[] = []
  const zone = session.timeZone
  const last = localDate(session.endsAt, zone)
  for (let date = localDate(session.startsAt, zone); date <= last; date = shiftDate(date, 1)) {
    if (!session.workingDays.includes(weekDays[weekday(date)])) continue
    const window = overlap(session, {
      startsAt: zonedDateTimeToIso(date, session.workingDayStart, zone),
      endsAt: zonedDateTimeToIso(date, session.workingDayEnd, zone),
    })
    if (window) result.push(window)
  }
  return result
}

export function splitByDay(window: Window, zone: string) {
  const first = localDate(window.startsAt, zone)
  // An exclusive end at midnight belongs to the preceding window.
  const last = localDate(new Date(Date.parse(window.endsAt) - 1).toISOString(), zone)
  const days = []
  for (let date = first; date <= last; date = shiftDate(date, 1)) {
    const startsAt = date === first ? window.startsAt : zonedDateTimeToIso(date, '00:00', zone)
    const midnight = zonedDateTimeToIso(shiftDate(date, 1), '00:00', zone)
    const endsAt = Date.parse(window.endsAt) < Date.parse(midnight) ? window.endsAt : midnight
    days.push({
      date, startsAt, endsAt, start: localTime(startsAt, zone),
      end: endsAt === midnight ? '24:00' : localTime(endsAt, zone),
    })
  }
  return days
}
