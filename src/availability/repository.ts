import { http, isMockMode } from '../api/http'
import { normalizeIntervals } from './time'
import type { BusyCalendar, IntervalInput, ReplaceCalendarRequest, SubmitCalendarRequest } from './types'

const storageKey = 'slotwise-demo-calendar-v1'
const sessionId = Number(import.meta.env.VITE_SESSION_ID || 1)
const demoCalendar: BusyCalendar = {
  sessionId, revision: 'demo-v1', timeZone: 'Europe/Moscow', responseStatus: 'NOT_RESPONDED', submittedAt: null,
  editable: true, timetableAvailable: true, issues: [],
  intervals: [
    { id: 1, startsAt: '2026-06-16T09:00:00Z', endsAt: '2026-06-16T11:00:00Z', importance: 'CRITICAL' },
    { id: 2, startsAt: '2026-06-17T07:00:00Z', endsAt: '2026-06-17T09:00:00Z', importance: 'MEDIUM' },
    { id: 3, startsAt: '2026-06-18T11:00:00Z', endsAt: '2026-06-18T12:00:00Z', importance: 'LOW' },
  ],
  knownBusy: [
    { startsAt: '2026-06-15T07:00:00Z', endsAt: '2026-06-15T09:00:00Z', description: 'Учебная пара' },
    { startsAt: '2026-06-19T08:00:00Z', endsAt: '2026-06-19T10:00:00Z', description: 'Пара · из вуза' },
  ],
}

function readMock(): BusyCalendar {
  const stored = localStorage.getItem(storageKey)
  return stored ? JSON.parse(stored) as BusyCalendar : structuredClone(demoCalendar)
}

function writeMock(calendar: BusyCalendar) { localStorage.setItem(storageKey, JSON.stringify(calendar)); return structuredClone(calendar) }

export async function getCalendar(): Promise<BusyCalendar> {
  if (isMockMode()) return readMock()
  const { data } = await http.get<BusyCalendar>(`/sessions/${sessionId}/busy-intervals/me`)
  return data
}

export async function replaceCalendar(expectedRevision: string, intervals: IntervalInput[]): Promise<BusyCalendar> {
  if (isMockMode()) {
    const current = readMock()
    if (current.revision !== expectedRevision) throw new Error('Данные изменились. Обновите календарь и повторите действие.')
    if (!current.editable) throw new Error('Сбор занятости закрыт.')
    const normalized = normalizeIntervals(intervals, current.timeZone, '2026-06-15', '2026-06-26', '09:00', '18:00')
    return writeMock({ ...current, revision: `demo-v${Number(current.revision.slice(6)) + 1}`, intervals: normalized.map((interval, index) => ({ ...interval, id: index + 1 })) })
  }
  const body: ReplaceCalendarRequest = { expectedRevision, intervals }
  const { data } = await http.put<BusyCalendar>(`/sessions/${sessionId}/busy-intervals/me`, body)
  return data
}

export async function submitCalendar(expectedRevision: string): Promise<BusyCalendar> {
  if (isMockMode()) {
    const current = readMock()
    if (current.revision !== expectedRevision) throw new Error('Данные изменились. Обновите календарь и повторите действие.')
    if (!current.editable) throw new Error('Сбор занятости закрыт.')
    return writeMock({ ...current, revision: `demo-v${Number(current.revision.slice(6)) + 1}`, responseStatus: 'SUBMITTED', submittedAt: new Date().toISOString() })
  }
  const body: SubmitCalendarRequest = { expectedRevision }
  const { data } = await http.post<BusyCalendar>(`/sessions/${sessionId}/busy-intervals/me/submit`, body)
  return data
}
