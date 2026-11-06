import type { Importance, IntervalInput } from './types'

const minute = 60_000
const slot = 5 * minute
const rank: Record<Importance, number> = { LOW: 1, MEDIUM: 2, CRITICAL: 3 }

function partsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  return Object.fromEntries(parts.map(part => [part.type, Number(part.value)])) as Record<string, number>
}

export function zonedDateTimeToIso(date: string, time: string, timeZone: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minutes] = time.split(':').map(Number)
  const wallTime = Date.UTC(year, month - 1, day, hour, minutes)
  let guess = wallTime
  for (let attempt = 0; attempt < 2; attempt++) {
    const actual = partsAt(new Date(guess), timeZone)
    const rendered = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute)
    guess += wallTime - rendered
  }
  return new Date(guess).toISOString()
}

export function formatInZone(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, ...options }).format(new Date(iso))
}

export function localDate(iso: string, timeZone: string) {
  const p = partsAt(new Date(iso), timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function localTime(iso: string, timeZone: string) {
  const p = partsAt(new Date(iso), timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

// Mirrors the server's 5-minute rounding, work-hour clipping and strongest-priority overlap rule in demo mode.
export function normalizeIntervals(inputs: IntervalInput[], timeZone: string, firstDay: string, lastDay: string, workStart: string, workEnd: string): IntervalInput[] {
  const segments: { start: number; end: number; importance: Importance }[] = []
  for (const input of inputs) {
    let start = Math.floor(new Date(input.startsAt).getTime() / slot) * slot
    const end = Math.ceil(new Date(input.endsAt).getTime() / slot) * slot
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue
    while (start < end) {
      const day = localDate(new Date(start).toISOString(), timeZone)
      const nextDay = new Date(`${day}T00:00:00Z`)
      nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      const nextMidnight = new Date(zonedDateTimeToIso(nextDay.toISOString().slice(0, 10), '00:00', timeZone)).getTime()
      const partEnd = Math.min(end, nextMidnight)
      const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
      if (day >= firstDay && day <= lastDay && weekday !== 0 && weekday !== 6) {
        const windowStart = new Date(zonedDateTimeToIso(day, workStart, timeZone)).getTime()
        const windowEnd = new Date(zonedDateTimeToIso(day, workEnd, timeZone)).getTime()
        if (Math.max(start, windowStart) < Math.min(partEnd, windowEnd)) segments.push({ start: Math.max(start, windowStart), end: Math.min(partEnd, windowEnd), importance: input.importance })
      }
      start = partEnd
    }
  }
  const boundaries = [...new Set(segments.flatMap(segment => [segment.start, segment.end]))].sort((a, b) => a - b)
  const result: typeof segments = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i], end = boundaries[i + 1]
    const active = segments.filter(segment => segment.start < end && segment.end > start).sort((a, b) => rank[b.importance] - rank[a.importance])[0]
    if (!active) continue
    const previous = result[result.length - 1]
    if (previous && previous.end === start && previous.importance === active.importance) previous.end = end
    else result.push({ start, end, importance: active.importance })
  }
  return result.map(segment => ({ startsAt: new Date(segment.start).toISOString(), endsAt: new Date(segment.end).toISOString(), importance: segment.importance }))
}
