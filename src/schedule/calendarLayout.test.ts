import { expect, it } from 'vitest'
import { layoutDay, type TimedAssignment } from './calendarLayout'
import { dateRange } from './dates'
import { publishedVariant } from './demoFixtures'

it('lays out overlapping assignments in separate columns and reuses space afterward', () => {
  const event = (id: number, start: string, end: string): TimedAssignment => ({
    ...publishedVariant.assignments[0], eventId: id, startsAt: `2026-06-15T${start}:00Z`, endsAt: `2026-06-15T${end}:00Z`,
  })
  const events = [event(1, '06:00', '07:30'), event(2, '07:00', '08:00'), event(3, '08:00', '08:30')]
  expect(layoutDay(events, '2026-06-15', 'Europe/Moscow')).toMatchObject([
    { start: 540, end: 630, lane: 0, lanes: 2 },
    { start: 600, end: 660, lane: 1, lanes: 2 },
    { start: 660, end: 690, lane: 0, lanes: 1 },
  ])
})

it('uses local midnight boundaries when the UTC offset changes during the week', () => {
  expect(dateRange('2026-03-23', 7, 'Europe/Berlin')).toEqual({
    from: '2026-03-22T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z',
  })
})
