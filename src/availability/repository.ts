import { api } from '../api/client'
import { isMockMode } from '../api/mode'
import { loadPages } from '../api/page'
import { normalizeIntervals } from './time'
import type { BusyCalendar, IntervalInput } from './types'

const storageKey = 'slotwise-demo-calendar-v1'
const demoSessionId = 1
const demoCalendar: BusyCalendar = {
  sessionId: demoSessionId, revision: 'demo-v1', timeZone: 'Europe/Moscow', responseStatus: 'NOT_RESPONDED', submittedAt: null,
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

export function listParticipantSessions() {
  return loadPages(page => api('get', '/api/sessions', { query: { page, size: 100 } }))
}

export async function getCalendar(id: number): Promise<BusyCalendar> {
  if (isMockMode()) return readMock()
  return api('get', '/api/sessions/{id}/busy-intervals/me', { path: { id } })
}

export async function replaceCalendar(id: number, expectedRevision: string, intervals: IntervalInput[]): Promise<BusyCalendar> {
  if (isMockMode()) {
    const current = readMock()
    if (current.revision !== expectedRevision) throw new Error('Данные изменились. Обновите календарь и повторите действие.')
    if (!current.editable) throw new Error('Сбор занятости закрыт.')
    const normalized = normalizeIntervals(intervals, current.timeZone, '2026-06-15', '2026-06-26', '09:00', '18:00')
    return writeMock({ ...current, revision: `demo-v${Number(current.revision.slice(6)) + 1}`, intervals: normalized.map((interval, index) => ({ ...interval, id: index + 1 })) })
  }
  return api('put', '/api/sessions/{id}/busy-intervals/me', { path: { id }, body: { expectedRevision, intervals } })
}

export async function submitCalendar(id: number, expectedRevision: string): Promise<BusyCalendar> {
  if (isMockMode()) {
    const current = readMock()
    if (current.revision !== expectedRevision) throw new Error('Данные изменились. Обновите календарь и повторите действие.')
    if (!current.editable) throw new Error('Сбор занятости закрыт.')
    return writeMock({ ...current, revision: `demo-v${Number(current.revision.slice(6)) + 1}`, responseStatus: 'SUBMITTED', submittedAt: new Date().toISOString() })
  }
  return api('post', '/api/sessions/{id}/busy-intervals/me/submit', { path: { id }, body: { expectedRevision } })
}
