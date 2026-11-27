import { allRecords, assertVersion, invalidateSessions, readDatabase, writeDatabase } from './repository'
import { api } from '../api/client'
import { isMockMode } from '../api/mode'
import { loadPages } from '../api/page'
import { deleteRecord, updateAccountAccess } from './remoteRecords'
import { personName, recordKey, roleLabels, type ResourceMap, type Schema } from './types'
import type { Field, FormValues, Option } from './components'
import { localDate, localTime, zonedDateTimeToIso } from '../availability/time'
import { authStore } from '../auth/authStore'

export const universitySections = { accounts: 'Учётные записи', groups: 'Учебные группы', rooms: 'Аудитории', disciplines: 'Дисциплины', equipment: 'Оборудование', teachings: 'Преподаватели дисциплин', supervisions: 'Научные руководители', timetable: 'Учебное расписание' }
export type UniversitySection = keyof typeof universitySections
export function publicPeople(enabled?: boolean): Promise<Schema['PersonSummary'][]> {
  if (isMockMode()) return Promise.resolve(readDatabase().accounts.filter(p => enabled === undefined || p.enabled === enabled))
  return loadPages(page => api('get', '/api/university/people', { query: { page, size: 100, enabled } }))
}
export const loadCatalogs = async () => {
  const [accounts, groups, rooms, disciplines, equipment] = await Promise.all([publicPeople(), allRecords('groups'), allRecords('rooms'), allRecords('disciplines'), allRecords('equipment')])
  return { accounts, groups, rooms, disciplines, equipment }
}
export type Catalogs = Awaited<ReturnType<typeof loadCatalogs>>
const names = (rows: { id: number; name: string }[]): Option[] => rows.map(r => ({ value: r.id, label: r.name }))
export function peopleOptions(rows: Schema['PersonSummary'][]): Option[] {
  const counts = new Map<string, number>()
  for (const person of rows) {
    const name = personName(person)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return rows.map(person => {
    const name = personName(person)
    return { value: person.id, label: counts.get(name) === 1 ? name : `${name} · №${person.id}` }
  })
}
export const timeZoneValid = (value: unknown) => { try { new Intl.DateTimeFormat('ru', { timeZone: String(value) }).format(); return true } catch { return false } }
export function universityFields(section: UniversitySection, catalog: Catalogs, editing: boolean): Field[] {
  const name: Field = { name: 'name', label: 'Название', required: true }
  const external: Field = { name: 'externalId', label: 'Внешний идентификатор' }
  const active: Field[] = editing ? [{ name: 'active', label: 'Активна', type: 'boolean' }] : []
  const select = (key: string, label: string, options: Option[], multiple = false, required = true): Field => ({ name: key, label, type: multiple ? 'multiple' : 'select', options, required })
  const students = peopleOptions(catalog.accounts.filter(p => p.role === 'STUDENT'))
  const teachers = peopleOptions(catalog.accounts.filter(p => p.role === 'TEACHER'))
  switch (section) {
    case 'accounts': return [
      { name: 'lastName', label: 'Фамилия', required: true }, { name: 'firstName', label: 'Имя', required: true }, { name: 'patronymic', label: 'Отчество' },
      { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'timeZone', label: 'Часовой пояс IANA', required: true }, external,
      ...(!editing ? [select('role', 'Роль', Object.entries(roleLabels).map(([value, label]) => ({ value, label })))] : []),
    ]
    case 'groups': return [name, external, select('studentIds', 'Студенты', students, true, false), ...active]
    case 'rooms': return [name, external, { name: 'online', label: 'Онлайн-площадка', type: 'boolean' }, { name: 'capacity', label: 'Вместимость (для очной аудитории)', type: 'number', min: 1 }, { name: 'building', label: 'Корпус' }, select('equipmentIds', 'Оборудование', names(catalog.equipment), true, false), ...active]
    case 'disciplines': return [name, external, ...active]
    case 'equipment': return [name]
    case 'teachings': return [select('teacherId', 'Преподаватель', teachers), select('disciplineId', 'Дисциплина', names(catalog.disciplines)), select('groupId', 'Группа', names(catalog.groups))]
    case 'supervisions': return [select('studentId', 'Студент', students), select('supervisorId', 'Научный руководитель', teachers)]
    case 'timetable': return [external, select('accountId', 'Участник', [{ value: '', label: 'Не выбран' }, ...peopleOptions(catalog.accounts)], false, false), select('roomId', 'Аудитория', [{ value: '', label: 'Не выбрана' }, ...names(catalog.rooms)], false, false), { name: 'startsAt', label: 'Начало (Europe/Moscow)', type: 'datetime-local', required: true }, { name: 'endsAt', label: 'Конец (Europe/Moscow)', type: 'datetime-local', required: true }, { name: 'description', label: 'Описание' }]
  }
}
export function universityDefaults(row?: object): FormValues {
  const values: FormValues = { active: true, studentIds: [], equipmentIds: [], timeZone: 'Europe/Moscow', role: 'STUDENT', online: false, ...row }
  for (const key of ['startsAt', 'endsAt']) if (values[key]) values[key] = `${localDate(String(values[key]), 'Europe/Moscow')}T${localTime(String(values[key]), 'Europe/Moscow')}`
  return values
}
export function universityPayload(section: UniversitySection, fields: Field[], values: FormValues) {
  const payload = Object.fromEntries(fields.map(f => [f.name, typeof values[f.name] === 'string' ? String(values[f.name]).trim() : values[f.name]]))
  for (const field of ['externalId', 'patronymic', 'building', 'description']) if (field in payload && !payload[field]) payload[field] = null
  if (section === 'rooms' && payload.online) { payload.capacity = null; payload.building = null }
  if (section === 'timetable') {
    for (const field of ['accountId', 'roomId']) payload[field] = payload[field] ? Number(payload[field]) : null
    for (const field of ['startsAt', 'endsAt']) { const [date, time] = String(payload[field]).split('T'); payload[field] = zonedDateTimeToIso(date, time, 'Europe/Moscow') }
  }
  return payload
}
export function validateUniversity(section: UniversitySection, values: FormValues): Record<string, string> {
  const errors: Record<string, string> = {}
  if (section === 'accounts' && !timeZoneValid(values.timeZone)) errors.timeZone = 'Укажите часовой пояс IANA, например Europe/Moscow'
  if (section === 'rooms' && !values.online && !(Number(values.capacity) > 0)) errors.capacity = 'Укажите вместимость очной аудитории'
  if (section === 'timetable') {
    if (!values.accountId && !values.roomId) errors.accountId = 'Выберите участника или аудиторию'
    if (String(values.endsAt) <= String(values.startsAt)) errors.endsAt = 'Конец должен быть позже начала'
  }
  return errors
}
export async function deleteUniversityRecord<R extends UniversitySection>(section: R, row: ResourceMap[R]) {
  if (section === 'accounts') throw new Error('Учётную запись можно отключить в настройках доступа.')
  if (!isMockMode()) {
    const remove = deleteRecord[section as Exclude<UniversitySection, 'accounts'>] as (record: ResourceMap[R]) => Promise<void>
    return remove(row)
  }
  const db = readDatabase()
  const id = 'id' in row ? Number(row.id) : 0
  const used = section === 'groups' ? db.events.some(e => e.studyGroupId === id) || db.teachings.some(t => t.groupId === id) || Object.values(db.selections).some(s => s.participants.studyGroupIds.includes(id))
    : section === 'rooms' ? db.timetable.some(t => t.roomId === id) || Object.values(db.selections).some(s => s.rooms.roomIds.includes(id))
      : section === 'disciplines' ? db.events.some(e => e.disciplineId === id) || db.teachings.some(t => t.disciplineId === id)
        : section === 'equipment' ? db.events.some(e => e.equipmentIds.includes(id)) || db.rooms.some(r => r.equipmentIds.includes(id)) || db['event-types'].some(t => t.equipmentIds.includes(id)) : false
  if (used) throw new Error('Запись используется. Для группы, аудитории или дисциплины снимите отметку «Активна» вместо удаления.')
  const current = db[section].find(r => recordKey(r) === recordKey(row))
  if (!current) throw new Error('Запись уже удалена.')
  if ('version' in current && 'version' in row) assertVersion(current.version, row.version)
  const rows = db[section] as ResourceMap[R][]
  rows.splice(rows.findIndex(r => recordKey(r) === recordKey(row)), 1)
  invalidateSessions(db)
  writeDatabase(db)
}

export const accountPasswordLength = { min: 8, max: 128 }

export function passwordError(value: unknown): string {
  const { min, max } = accountPasswordLength
  if (typeof value !== 'string' || !value.trim()) return 'Введите непустой пароль.'
  if (value.length < min || value.length > max) return `Введите пароль длиной от ${min} до ${max} символов.`
  return ''
}
export async function accountAction(account: Schema['AccountResponse'], action: 'role' | 'enabled' | 'password', value: string | boolean): Promise<Schema['AccountResponse']> {
  const validationError = action === 'password' ? passwordError(value) : ''
  if (validationError) throw new Error(validationError)
  if (!isMockMode()) return updateAccountAccess(account, action, value)
  const db = readDatabase(), current = db.accounts.find(a => a.id === account.id)
  if (!current) throw new Error('Пользователь не найден.')
  assertVersion(current.version, account.version)
  if (action === 'role' && current.id === authStore.user?.id && value !== current.role) throw new Error('Нельзя изменить собственную роль.')
  if (current.role === 'ADMIN' && current.enabled && (action === 'enabled' && !value || action === 'role' && value !== 'ADMIN') && db.accounts.filter(a => a.role === 'ADMIN' && a.enabled).length === 1) throw new Error('Нельзя отключить или изменить роль последнего активного администратора.')
  if (action === 'password') current.hasPassword = true // Never persist a password in demo storage.
  else if (action === 'role') current.role = value as Schema['AccountRole']
  else current.enabled = Boolean(value)
  current.version++
  invalidateSessions(db)
  writeDatabase(db)
  return structuredClone(current)
}
