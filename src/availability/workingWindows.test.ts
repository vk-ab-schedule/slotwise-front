import { describe, expect, it } from 'vitest'
import { localDateTime, parseLocalDateTime } from './time'
import { overlap, splitByDay, workingWindows, type CalendarSession } from './workingWindows'

const session: CalendarSession = {
  id: 1, name: 'Защиты', timeZone: 'Europe/Moscow',
  startsAt: '2026-11-27T00:00:00Z', endsAt: '2026-11-28T15:00:00Z',
  workingDays: ['FRIDAY'], workingDayStart: '09:00:00', workingDayEnd: '18:00:00',
  collectionEndsAt: '2026-11-26T12:00:00Z', collectionStatus: 'OPEN',
}

describe('participant working windows', () => {
  it('renders a Friday session as an afternoon window and its Saturday tail in Vladivostok', () => {
    const windows = workingWindows(session)
    expect(windows).toEqual([{ startsAt: '2026-11-27T06:00:00.000Z', endsAt: '2026-11-27T15:00:00.000Z' }])
    expect(splitByDay(windows[0], 'Asia/Vladivostok').map(({ date, start, end }) => ({ date, start, end }))).toEqual([
      { date: '2026-11-27', start: '16:00', end: '24:00' },
      { date: '2026-11-28', start: '00:00', end: '01:00' },
    ])
  })

  it('clips the working window to the session end and omits an exclusive midnight column', () => {
    const [window] = workingWindows({ ...session, endsAt: '2026-11-27T14:00:00Z' })
    expect(splitByDay(window, 'Asia/Vladivostok')).toMatchObject([{ date: '2026-11-27', start: '16:00', end: '24:00' }])
  })

  it('serializes participant input across midnight and rejects times in a DST gap', () => {
    const startsAt = parseLocalDateTime('2026-11-27T23:45', 'Asia/Vladivostok')!
    const endsAt = parseLocalDateTime('2026-11-28T00:15', 'Asia/Vladivostok')!
    expect(overlap({ startsAt, endsAt }, workingWindows(session)[0])).toEqual({
      startsAt: '2026-11-27T13:45:00.000Z', endsAt: '2026-11-27T14:15:00.000Z',
    })
    expect(localDateTime(endsAt, 'Asia/Vladivostok')).toBe('2026-11-28T00:15')
    expect(parseLocalDateTime('2026-03-29T02:30', 'Europe/Berlin')).toBeNull()
  })
})
