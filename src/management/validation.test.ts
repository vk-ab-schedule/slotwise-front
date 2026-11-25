import { describe, expect, it } from 'vitest'
import { validateFields } from './components'
import { initialDatabase, defaultRules } from './demo'
import { validateEventType } from './eventTypes'
import { validateRules } from './rules'
import { sessionDefaults, sessionPayload, validateSession } from './sessions'
import { universityPayload, validateUniversity } from './university'

describe('event templates', () => {
  const types = initialDatabase()['event-types']
  it('accepts the defense template with a predecessor and 5-minute duration', () => {
    expect(validateEventType({ ...types[4], defaultDurationMinutes: 20 }, types, 5)).toEqual({})
  })
  it.each([0, -5, 17, 2.5, NaN])('rejects invalid duration %s', duration => {
    expect(validateEventType({ ...types[4], defaultDurationMinutes: duration }, types, 5).defaultDurationMinutes).toBeTruthy()
  })
  it('shows the complete named dependency cycle', () => {
    const result = validateEventType({ ...types[3], dependencies: [{ predecessorTypeId: 5, minGapDays: 0 }] }, types, 4)
    expect(result.dependencies).toContain('Предзащита → Защита ВКР → Предзащита')
  })
  it('rejects self references, duplicate predecessors and reversed gaps', () => {
    expect(validateEventType({ ...types[4], dependencies: [{ predecessorTypeId: 5, minGapDays: 0 }] }, types, 5).dependencies).toBeTruthy()
    expect(validateEventType({ ...types[4], dependencies: [{ predecessorTypeId: 4, minGapDays: 0 }, { predecessorTypeId: 4, minGapDays: 2 }] }, types, 5).dependencies).toBeTruthy()
    expect(validateEventType({ ...types[4], dependencies: [{ predecessorTypeId: 4, minGapDays: 3, maxGapDays: 2 }] }, types, 5).dependencies).toBeTruthy()
  })
  it('requires a nonempty commission for a chair', () => {
    expect(validateEventType({ ...types[4], commissionSize: 0 }, types, 5).commissionSize).toBeTruthy()
  })
})

describe('session wall times', () => {
  const values = sessionDefaults(initialDatabase().sessions[0])
  it('round trips Moscow instants independently of the host timezone', () => {
    expect(validateSession(values)).toEqual({})
    expect(sessionPayload(values).startsAt).toBe('2026-06-14T21:00:00.000Z')
    expect(sessionPayload(values).collectionEndsAt).toBe('2026-06-10T15:00:00.000Z')
    expect(sessionPayload(values).workingDayStart).toBe('09:00:00')
  })
  it('handles another timezone without using the browser timezone', () => {
    expect(sessionPayload({ ...values, timeZone: 'Asia/Vladivostok' }).startsAt).toBe('2026-06-14T14:00:00.000Z')
  })
  it('rejects a nonexistent daylight-saving wall time', () => {
    expect(() => sessionPayload({ ...values, timeZone: 'Europe/Berlin', collectionStartsAt: '2026-03-29T02:30' })).toThrow('не существует')
  })
  it('rejects collection ending exactly at the start of the period', () => {
    expect(validateSession({ ...values, collectionEndsAt: '2026-06-15T00:00' }).collectionEndsAt).toBeTruthy()
  })
  it('preserves exact session boundaries on rename and accepts a same-day collection deadline before start', () => {
    const original = {
      ...initialDatabase().sessions[0],
      startsAt: '2026-06-15T06:00:12.345Z',
      endsAt: '2026-06-15T12:00:20Z',
      collectionEndsAt: '2026-06-15T05:00:00Z',
    }
    const renamed = { ...sessionDefaults(original), name: 'Новое название' }
    expect(validateSession(renamed, original)).toEqual({})
    expect(sessionPayload(renamed, original)).toMatchObject({
      name: renamed.name, startsAt: original.startsAt, endsAt: original.endsAt,
      collectionEndsAt: original.collectionEndsAt,
    })
    expect(validateSession({ ...renamed, collectionEndsAt: '2026-06-15T09:01' }, original).collectionEndsAt).toBeTruthy()
    expect(sessionPayload({ ...renamed, lastDay: '2026-06-16' }, original).endsAt).toBe('2026-06-16T12:00:00.000Z')
  })
  it('rejects reversed periods, work hours and invalid zones', () => {
    expect(validateSession({ ...values, lastDay: '2026-06-01', workingDayEnd: '08:00', timeZone: 'Mars/City' })).toMatchObject({ lastDay: expect.any(String), workingDayEnd: expect.any(String), timeZone: expect.any(String) })
  })
  it('rejects a period without a selected working day', () => {
    expect(validateSession({ ...values, firstDay: '2026-06-20', lastDay: '2026-06-21' }).workingDays).toBeTruthy()
  })
})

describe('rules and university forms', () => {
  it('allows zero soft weights and signed reproducible seeds', () => {
    expect(validateRules({ ...defaultRules(), seed: -42, weights: { teacherGaps: 0, commissionLoadSpread: 0, undesirableTime: 0, teacherRoomChanges: 0, movedEvents: 0 } })).toEqual({})
  })
  it('validates buffer, time limit and integer weights', () => {
    expect(validateRules({ ...defaultRules(), roomChangeBufferMinutes: 7, timeLimitSeconds: 301, weights: { ...defaultRules().weights, teacherGaps: -1 } })).toMatchObject({ roomChangeBufferMinutes: expect.any(String), timeLimitSeconds: expect.any(String), teacherGaps: expect.any(String) })
  })
  it('treats blank numeric fields as missing instead of zero', () => {
    expect(validateFields([{ name: 'capacity', label: 'Capacity', type: 'number', min: 1, required: true }], { capacity: '' }).capacity).toBeTruthy()
  })
  it('requires a timetable target and increasing interval', () => {
    expect(validateUniversity('timetable', { startsAt: '2026-06-15T10:00', endsAt: '2026-06-15T09:00' })).toMatchObject({ accountId: expect.any(String), endsAt: expect.any(String) })
  })
  it('sends online rooms with null capacity and building', () => {
    expect(universityPayload('rooms', [{ name: 'online', label: '' }, { name: 'capacity', label: '' }, { name: 'building', label: '' }], { online: true, capacity: 30, building: 'Campus' })).toEqual({ online: true, capacity: null, building: null })
  })
})
