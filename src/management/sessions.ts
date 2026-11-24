import { http, isMockMode } from '../api/http'
import { localDate, localTime, zonedDateTimeToIso } from '../availability/time'
import { authStore } from '../auth/authStore'
import { assertVersion, readDatabase, writeDatabase } from './repository'
import { timeZoneValid } from './university'
import { dayLabels, type Database, type Schema } from './types'
import type { Field, FormValues } from './components'

export const sessionFields: Field[] = [
  { name: 'name', label: 'Название', required: true },
  { name: 'firstDay', label: 'Первый день периода', type: 'date', required: true }, { name: 'lastDay', label: 'Последний день периода', type: 'date', required: true },
  { name: 'timeZone', label: 'Часовой пояс IANA', required: true, hint: 'Например Europe/Moscow. Все часы формы указаны в этом поясе.' },
  { name: 'workingDays', label: 'Рабочие дни', type: 'multiple', required: true, options: Object.entries(dayLabels).map(([value, label]) => ({ value, label })) },
  { name: 'workingDayStart', label: 'Начало рабочего дня', type: 'time', required: true }, { name: 'workingDayEnd', label: 'Конец рабочего дня', type: 'time', required: true },
  { name: 'collectionStartsAt', label: 'Начало сбора занятости', type: 'datetime-local', required: true }, { name: 'collectionEndsAt', label: 'Конец сбора занятости', type: 'datetime-local', required: true },
]
export function sessionDefaults(session?: Schema['PlanningSessionResponse']): FormValues {
  if (!session) return { name: '', firstDay: '', lastDay: '', timeZone: 'Europe/Moscow', workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], workingDayStart: '09:00', workingDayEnd: '18:00', collectionStartsAt: '', collectionEndsAt: '' }
  const zone = session.timeZone
  return { ...session, firstDay: localDate(session.startsAt, zone), lastDay: localDate(session.endsAt, zone), workingDayStart: session.workingDayStart.slice(0, 5), workingDayEnd: session.workingDayEnd.slice(0, 5), collectionStartsAt: `${localDate(session.collectionStartsAt, zone)}T${localTime(session.collectionStartsAt, zone)}`, collectionEndsAt: `${localDate(session.collectionEndsAt, zone)}T${localTime(session.collectionEndsAt, zone)}` }
}
export function validateSession(v: FormValues, original?: Schema['PlanningSessionResponse']): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!timeZoneValid(v.timeZone)) errors.timeZone = 'Неизвестный часовой пояс IANA'
  if (String(v.lastDay) < String(v.firstDay)) errors.lastDay = 'Конец периода не может быть раньше начала'
  if (String(v.workingDayEnd) <= String(v.workingDayStart)) errors.workingDayEnd = 'Рабочий день должен заканчиваться позже начала'
  if (!errors.timeZone && v.firstDay && v.lastDay && v.workingDayEnd && v.collectionStartsAt && v.collectionEndsAt) {
    try {
      const period = sessionInstants(v, original)
      if (Date.parse(period.endsAt) <= Date.parse(period.startsAt)) errors.lastDay = 'Конец периода должен быть позже начала'
      if (Date.parse(period.collectionEndsAt) <= Date.parse(period.collectionStartsAt)) errors.collectionEndsAt = 'Конец сбора должен быть позже начала'
      else if (Date.parse(period.collectionEndsAt) >= Date.parse(period.startsAt)) errors.collectionEndsAt = 'Сбор должен закончиться до начала сессии'
    } catch (error) {
      errors.timeZone = error instanceof Error ? error.message : 'Проверьте даты и часовой пояс'
    }
  }
  if (!Array.isArray(v.workingDays) || !v.workingDays.length) errors.workingDays = 'Выберите рабочие дни'
  else if (v.firstDay && v.lastDay && String(v.firstDay) <= String(v.lastDay)) {
    const start = Date.parse(`${v.firstDay}T00:00:00Z`), end = Date.parse(`${v.lastDay}T00:00:00Z`)
    const days = Object.keys(dayLabels)
    let found = false
    for (let day = start; day <= Math.min(end, start + 6 * 86400000); day += 86400000) if (v.workingDays.includes(days[(new Date(day).getUTCDay() + 6) % 7])) found = true
    if (!found) errors.workingDays = 'В периоде нет выбранных рабочих дней'
  }
  return errors
}
function sessionInstants(v: FormValues, original?: Schema['PlanningSessionResponse']) {
  const zone = String(v.timeZone)
  const toInstant = (value: string) => {
    const [date, time] = value.split('T'), iso = zonedDateTimeToIso(date, time, zone)
    if (`${localDate(iso, zone)}T${localTime(iso, zone)}` !== value.slice(0, 16)) throw new Error('Указанное время не существует в выбранном часовом поясе. Проверьте переход на летнее время.')
    return iso
  }
  const wallTime = (instant: string) => `${localDate(instant, zone)}T${localTime(instant, zone)}`
  const keepOrConvert = (value: string, previous?: string) =>
    previous && zone === original?.timeZone && value === wallTime(previous) ? previous : toInstant(value)
  const startTime = original ? localTime(original.startsAt, original.timeZone) : '00:00'
  const endTime = original ? localTime(original.endsAt, original.timeZone) : String(v.workingDayEnd)
  return {
    startsAt: keepOrConvert(`${v.firstDay}T${startTime}`, original?.startsAt),
    endsAt: keepOrConvert(`${v.lastDay}T${endTime}`, original?.endsAt),
    collectionStartsAt: keepOrConvert(String(v.collectionStartsAt), original?.collectionStartsAt),
    collectionEndsAt: keepOrConvert(String(v.collectionEndsAt), original?.collectionEndsAt),
  }
}
export function sessionPayload(v: FormValues, original?: Schema['PlanningSessionResponse']): Schema['CreatePlanningSessionRequest'] {
  return {
    name: String(v.name).trim(), timeZone: String(v.timeZone),
    workingDayStart: `${v.workingDayStart}:00`, workingDayEnd: `${v.workingDayEnd}:00`,
    workingDays: v.workingDays as Schema['DayOfWeek'][],
    ...sessionInstants(v, original),
  }
}

export function ownedSession(db: Database, id: number) {
  const session = db.sessions.find(s => s.id === id && s.organizerId === authStore.user?.id)
  if (!session) throw new Error('Сессия не найдена или недоступна.')
  return session
}
export async function getSession(id: number): Promise<Schema['PlanningSessionResponse']> {
  return isMockMode() ? structuredClone(ownedSession(readDatabase(), id)) : (await http.get<Schema['PlanningSessionResponse']>(`/sessions/${id}`)).data
}
export async function publicPeople(): Promise<Schema['PersonSummary'][]> {
  if (isMockMode()) return readDatabase().accounts.filter(p => p.enabled)
  const result: Schema['PersonSummary'][] = []
  let page = 0, total = 1
  while (page < total) { const { data } = await http.get<{ items: Schema['PersonSummary'][]; totalPages: number }>('/university/people', { params: { page, size: 100, enabled: true } }); result.push(...data.items); total = data.totalPages; page++ }
  return result
}

export type SelectionKind = 'participants' | 'rooms' | 'commission'
export type Selection = Database['selections'][number]
export const selectionPath = (kind: SelectionKind) => kind === 'commission' ? 'commission-pool' : kind
export async function getSelections(id: number): Promise<Selection> {
  if (isMockMode()) {
    const db = readDatabase()
    const session = ownedSession(db, id)
    const selection = structuredClone(db.selections[id])
    for (const section of Object.values(selection)) {
      section.sessionVersion = session.version
      section.inputVersion = session.inputVersion
    }
    return selection
  }
  const [participants, rooms, commission] = await Promise.all([
    http.get<Selection['participants']>(`/sessions/${id}/participants`), http.get<Selection['rooms']>(`/sessions/${id}/rooms`), http.get<Selection['commission']>(`/sessions/${id}/commission-pool`),
  ])
  return { participants: participants.data, rooms: rooms.data, commission: commission.data }
}
export function acceptSelectionSave<K extends SelectionKind>(selection: Selection, kind: K, saved: Selection[K], expectedVersion: number): Selection {
  const next = { ...selection, [kind]: saved }
  // Only drafts from the version accepted by this write can advance with it.
  for (const key of ['participants', 'rooms', 'commission'] as const) {
    if (key !== kind && selection[key].sessionVersion === expectedVersion) {
      Object.assign(next, { [key]: { ...selection[key], sessionVersion: saved.sessionVersion, inputVersion: saved.inputVersion } })
    }
  }
  return next
}
export async function saveSelection<K extends SelectionKind>(id: number, kind: K, value: Selection[K]): Promise<Selection[K]> {
  const expectedVersion = value.sessionVersion
  const body = kind === 'participants' ? { studyGroupIds: (value as Selection['participants']).studyGroupIds, accountIds: (value as Selection['participants']).accountIds, expectedVersion }
    : kind === 'rooms' ? { roomIds: (value as Selection['rooms']).roomIds, expectedVersion } : { candidates: (value as Selection['commission']).candidates, expectedVersion }
  if (!isMockMode()) return (await http.put<Selection[K]>(`/sessions/${id}/${selectionPath(kind)}`, body)).data
  const db = readDatabase(), session = ownedSession(db, id)
  assertVersion(session.version, expectedVersion)
  if (kind === 'participants') {
    const participants = value as Selection['participants']
    const ids = new Set([...participants.accountIds, ...db.groups.filter(g => participants.studyGroupIds.includes(g.id)).flatMap(g => g.studentIds)])
    if (db.events.filter(e => e.sessionId === id).some(e => e.participants.some(p => p.role === 'STUDENT' && !ids.has(p.accountId)))) throw new Error('Нельзя убрать участников, которые уже используются в событиях.')
  }
  session.version++; session.inputVersion++
  const updated = { ...value, sessionId: id, sessionVersion: session.version, inputVersion: session.inputVersion }
  if (kind === 'participants') {
    const p = updated as Selection['participants']
    const ids = new Set([...p.accountIds, ...db.groups.filter(g => p.studyGroupIds.includes(g.id)).flatMap(g => g.studentIds)])
    p.participants = db.accounts.filter(a => ids.has(a.id))
  }
  db.selections[id][kind] = updated
  writeDatabase(db)
  return structuredClone(updated)
}
