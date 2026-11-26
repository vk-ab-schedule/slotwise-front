import { localTime } from '../availability/time'
import { dateRange } from './dates'
import type { Assignment } from './model'

export type TimedAssignment = Assignment & { startsAt: string; endsAt: string }
export const isScheduled = (event: Assignment): event is TimedAssignment =>
  event.status === 'ASSIGNED' && event.startsAt !== null && event.endsAt !== null

export function minutes(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return hour * 60 + minute
}

export function layoutDay(events: TimedAssignment[], day: string, zone: string) {
  const { from, to } = dateRange(day, 1, zone)
  const dayStart = Date.parse(from)
  const dayEnd = Date.parse(to)
  const points = events.flatMap(event => {
    const start = Date.parse(event.startsAt)
    const end = Date.parse(event.endsAt)
    if (start >= dayEnd || end <= dayStart) return []
    const startMinute = start <= dayStart ? 0 : minutes(localTime(event.startsAt, zone))
    const endMinute = end >= dayEnd ? 1440 : Math.max(startMinute + 1, minutes(localTime(event.endsAt, zone)))
    return [{ event, start: startMinute, end: endMinute, lane: 0, lanes: 1 }]
  }).sort((a, b) => a.start - b.start || a.end - b.end)

  let laneEnds: number[] = []
  let group: typeof points = []
  const finishGroup = () => {
    for (const point of group) point.lanes = laneEnds.length
    laneEnds = []
    group = []
  }
  for (const point of points) {
    if (laneEnds.every(end => end <= point.start)) finishGroup()
    const freeLane = laneEnds.findIndex(end => end <= point.start)
    point.lane = freeLane < 0 ? laneEnds.length : freeLane
    laneEnds[point.lane] = point.end
    group.push(point)
  }
  finishGroup()
  return points
}
