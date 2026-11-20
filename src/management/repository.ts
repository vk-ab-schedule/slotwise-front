import axios from 'axios'
import { http, isMockMode } from '../api/http'
import { authStore } from '../auth/authStore'
import { defaultRules, initialDatabase } from './demo'
import { recordKey, type Database, type Page, type Resource, type ResourceMap, type Schema, type WriteMap } from './types'

export const managementStorageKey = 'slotwise-demo-management-v1'
export function readDatabase(): Database {
  const raw = localStorage.getItem(managementStorageKey)
  if (!raw) return initialDatabase()
  try { const db = JSON.parse(raw) as Database; db.events ??= []; db.eventRoles ??= {}; db.eventDependencies ??= {}; return db } catch { throw new Error('Не удалось прочитать демо-данные. Удалите slotwise-demo-management-v1 в хранилище браузера.') }
}
export function writeDatabase(db: Database) { localStorage.setItem(managementStorageKey, JSON.stringify(db)) }

// Demo has no saved solver variants; bumping input versions still exposes stale editors.
export function invalidateSessions(db: Database) {
  for (const session of db.sessions) { session.version++; session.inputVersion++ }
}

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<Schema['ApiProblem']>(error)) {
    if (error.response?.status === 409 && /STALE|VERSION|REVISION/i.test(error.response.data?.code ?? '')) return 'Данные изменились. Обновите страницу и повторите изменения.'
    if (error.response?.status === 501) return 'Эта операция ещё не реализована на сервере. Попробуйте позже.'
    const problem = error.response?.data
    return [problem?.detail, ...(problem?.fieldErrors?.map(e => `${e.field}: ${e.message}`) ?? []), ...(problem?.issues?.map(i => i.message) ?? [])].filter(Boolean).join('\n') || 'Не удалось выполнить запрос. Проверьте соединение и повторите.'
  }
  return error instanceof Error ? error.message : 'Не удалось выполнить действие.'
}

const readPath = (r: Resource) => r === 'accounts' ? '/admin/accounts' : r === 'sessions' || r === 'event-types' ? `/${r}` : `/university/${r}`
const writePath = (r: Resource) => r === 'sessions' || r === 'event-types' ? `/${r}` : `/admin/${r}`
const writeFields: { [R in Resource]: readonly (keyof WriteMap[R])[] } = {
  accounts: ['email', 'externalId', 'firstName', 'lastName', 'patronymic', 'role', 'timeZone'],
  groups: ['name', 'externalId', 'studentIds', 'active'], rooms: ['name', 'externalId', 'building', 'capacity', 'online', 'equipmentIds', 'active'],
  disciplines: ['name', 'externalId', 'active'], equipment: ['name'], teachings: ['teacherId', 'disciplineId', 'groupId'], supervisions: ['studentId', 'supervisorId'],
  timetable: ['accountId', 'roomId', 'startsAt', 'endsAt', 'externalId', 'description'],
  'event-types': ['name', 'active', 'defaultDurationMinutes', 'defaultFormat', 'granularity', 'participantRoles', 'commissionSize', 'requiresChair', 'preparationDays', 'equipmentIds', 'dependencies'],
  sessions: ['name', 'timeZone', 'startsAt', 'endsAt', 'workingDayStart', 'workingDayEnd', 'workingDays', 'collectionStartsAt', 'collectionEndsAt'],
}
export function assertVersion(current: number, expected: number | undefined) {
  if (expected !== current) throw new Error('Данные изменились. Обновите страницу и повторите изменения.')
}
function visible<R extends Resource>(resource: R, db: Database): ResourceMap[R][] {
  const rows = db[resource]
  return (resource === 'sessions' ? (rows as Database['sessions']).filter(r => r.organizerId === authStore.user?.id) : rows) as ResourceMap[R][]
}
export async function listRecords<R extends Resource>(resource: R, page = 0, search = ''): Promise<Page<ResourceMap[R]>> {
  if (!isMockMode()) return (await http.get<Page<ResourceMap[R]>>(readPath(resource), { params: { page, size: 20, ...(resource === 'sessions' ? {} : { search }) } })).data
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const rows = visible(resource, readDatabase()).filter(r => terms.every(term => JSON.stringify(r).toLocaleLowerCase().includes(term)))
  return { items: structuredClone(rows.slice(page * 20, (page + 1) * 20)), page, size: 20, totalElements: rows.length, totalPages: Math.ceil(rows.length / 20) }
}
export async function allRecords<R extends Resource>(resource: R): Promise<ResourceMap[R][]> {
  const first = await listRecords(resource)
  const rows = [...first.items]
  for (let page = 1; page < first.totalPages; page++) rows.push(...(await listRecords(resource, page)).items)
  return rows
}
export async function saveRecord<R extends Resource>(resource: R, input: WriteMap[R], existing?: ResourceMap[R]): Promise<ResourceMap[R]> {
  // Response objects are convenient form defaults, but read-only fields must never be sent back.
  input = Object.fromEntries(writeFields[resource].filter(key => key in input && !(key === 'role' && existing) && !(key === 'active' && !existing && resource !== 'event-types')).map(key => [key, input[key]])) as unknown as WriteMap[R]
  const version = existing && 'version' in existing ? existing.version : undefined
  const body = version !== undefined ? { ...input, expectedVersion: version } : input
  if (!isMockMode()) {
    const path = `${writePath(resource)}${existing ? `/${recordKey(existing)}` : ''}`
    return (await http.request<ResourceMap[R]>({ url: path, method: !existing ? 'POST' : resource === 'accounts' || resource === 'sessions' ? 'PATCH' : 'PUT', data: body })).data
  }
  const db = readDatabase()
  const rows = db[resource] as ResourceMap[R][]
  const current = existing && rows.find(r => recordKey(r) === recordKey(existing))
  if (existing && !current) throw new Error('Запись больше не существует. Обновите страницу.')
  if (current && 'version' in current) assertVersion(current.version, version)
  const named = input as { name?: string; email?: string }
  if (rows.some(r => recordKey(r) !== (existing && recordKey(existing)) && (named.name && 'name' in r && r.name.toLocaleLowerCase() === named.name.toLocaleLowerCase() || named.email && 'email' in r && r.email.toLocaleLowerCase() === named.email.toLocaleLowerCase()))) throw new Error('Запись с таким названием или email уже существует.')
  if (resource === 'teachings') {
    const link = input as WriteMap['teachings']
    if (db.teachings.some(t => t.teacherId === link.teacherId && t.disciplineId === link.disciplineId && t.groupId === link.groupId)) throw new Error('Такая связь преподавателя, дисциплины и группы уже существует.')
  }
  if (resource === 'supervisions') {
    const link = input as WriteMap['supervisions']
    if (db.supervisions.some(s => s.studentId === link.studentId && s.supervisorId === link.supervisorId)) throw new Error('Такая связь студента и руководителя уже существует.')
  }
  const id = Math.max(0, ...rows.map(r => 'id' in r ? Number(r.id) : 0)) + 1
  const now = new Date().toISOString()
  const defaults: Record<Resource, object> = {
    accounts: { id, version: 1, externalId: null, enabled: true, hasPassword: false, patronymic: null, createdAt: now },
    groups: { id, version: 1, active: true, externalId: null }, rooms: { id, version: 1, active: true, externalId: null, building: null, capacity: null },
    disciplines: { id, version: 1, active: true, externalId: null }, equipment: { id }, teachings: { id }, supervisions: {},
    timetable: { id, externalId: null, accountId: null, roomId: null, description: null }, 'event-types': { id, version: 1 }, sessions: { id, version: 1, createdAt: now },
  }
  const result = { ...defaults[resource], ...current, ...input, ...(current && 'version' in current ? { version: current.version + 1 } : {}), ...(resource === 'accounts' ? { updatedAt: now } : {}) } as unknown as ResourceMap[R]
  if (resource === 'sessions') {
    const session = result as Schema['PlanningSessionResponse']
    session.organizerId = authStore.user!.id
    session.collectionStatus = (current as Schema['PlanningSessionResponse'] | undefined)?.collectionStatus ?? 'PENDING'
    session.inputVersion = ((current as Schema['PlanningSessionResponse'] | undefined)?.inputVersion ?? 0) + 1
    if (!current) {
      db.rules[session.id] = defaultRules()
      const base = { sessionId: session.id, sessionVersion: 1, inputVersion: 1 }
      db.selections[session.id] = { participants: { ...base, studyGroupIds: [], accountIds: [], participants: [] }, rooms: { ...base, roomIds: [] }, commission: { ...base, candidates: [] } }
    }
  }
  if (current) rows[rows.indexOf(current)] = result
  else rows.push(result)
  if (resource !== 'sessions' && resource !== 'event-types') invalidateSessions(db)
  writeDatabase(db)
  return structuredClone(result)
}
