import { describe, expect, it } from 'vitest'
import { normalizeIntervals, zonedDateTimeToIso } from './time'

const zone = 'Europe/Moscow'
const iso = (day: string, time: string) => zonedDateTimeToIso(day, time, zone)

describe('availability intervals', () => {
  it('converts session-local time to UTC', () => {
    expect(iso('2026-06-16', '12:00')).toBe('2026-06-16T09:00:00.000Z')
  })

  it('rounds outward and clips to working hours', () => {
    const result = normalizeIntervals([
      { startsAt: iso('2026-06-16', '08:58'), endsAt: iso('2026-06-16', '10:12'), importance: 'LOW' },
      { startsAt: iso('2026-06-20', '10:00'), endsAt: iso('2026-06-20', '11:00'), importance: 'CRITICAL' },
    ], zone, '2026-06-15', '2026-06-26', '09:00', '18:00')
    expect(result).toEqual([{ startsAt: iso('2026-06-16', '09:00'), endsAt: iso('2026-06-16', '10:15'), importance: 'LOW' }])
  })

  it('uses the strongest importance only in the overlapping segment', () => {
    const result = normalizeIntervals([
      { startsAt: iso('2026-06-16', '10:00'), endsAt: iso('2026-06-16', '12:00'), importance: 'LOW' },
      { startsAt: iso('2026-06-16', '11:00'), endsAt: iso('2026-06-16', '11:30'), importance: 'CRITICAL' },
    ], zone, '2026-06-15', '2026-06-26', '09:00', '18:00')
    expect(result.map(interval => [interval.startsAt, interval.endsAt, interval.importance])).toEqual([
      [iso('2026-06-16', '10:00'), iso('2026-06-16', '11:00'), 'LOW'],
      [iso('2026-06-16', '11:00'), iso('2026-06-16', '11:30'), 'CRITICAL'],
      [iso('2026-06-16', '11:30'), iso('2026-06-16', '12:00'), 'LOW'],
    ])
  })
})
