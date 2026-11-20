import { http, isMockMode } from '../api/http'
import { readDatabase, writeDatabase } from './repository'
import { timeZoneValid } from './university'
import type { Database, Schema } from './types'

type Import = Schema['UniversityImportRequest']
type Section = keyof Import
const sections: Section[] = ['accounts', 'groups', 'rooms', 'disciplines', 'teaching', 'supervision', 'timetable']
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Validate structure before the request; record-level business errors belong in the preview.
export function parseImport(text: string): Import {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('Файл содержит некорректный JSON.') }
  if (!isObject(value)) throw new Error('Корень JSON должен быть объектом с разделами данных вуза.')
  if (!sections.some(s => s in value) || Object.keys(value).some(s => !sections.includes(s as Section))) throw new Error('Допустимые разделы: accounts, groups, rooms, disciplines, teaching, supervision, timetable.')
  for (const section of sections) {
    if (!(section in value)) value[section] = []
    if (!Array.isArray(value[section]) || !(value[section] as unknown[]).every(isObject)) throw new Error(`${section}: ожидается массив объектов.`)
  }
  return value as Import
}

export async function importUniversity(input: Import, dryRun: boolean, allowPartial = false): Promise<Schema['UniversityImportResponse']> {
  if (!isMockMode()) return (await http.post<Schema['UniversityImportResponse']>('/admin/import', input, { params: { dryRun, allowPartial } })).data
  const db = readDatabase()
  const diagnostics: Schema['UniversityImportDiagnostic'][] = []
  const counts = () => ({ total: 0, created: 0, updated: 0, unchanged: 0, rejected: 0 })
  const report = Object.fromEntries(sections.map(s => [s, counts()])) as Schema['UniversityImportSections']
  const nextId = (rows: { id: number }[]) => Math.max(0, ...rows.map(r => r.id)) + 1
  const external = (rows: { externalId: string | null; id: number }[], id: unknown) => typeof id === 'string' ? rows.find(r => r.externalId === id)?.id : undefined
  const requireText = (v: unknown) => typeof v === 'string' && v.trim().length > 0
  const reject = (section: Section, index: number, message: string) => {
    report[section].rejected++
    diagnostics.push({ path: `${section}[${index}]`, issue: { code: 'INVALID_IMPORT_RECORD', severity: 'ERROR', message, accountIds: [], eventIds: [], roomIds: [] } })
  }
  function upsert<R extends 'accounts' | 'groups' | 'rooms' | 'disciplines' | 'timetable'>(section: R, row: Database[R][number], index: number) {
    const rows = db[section] as Database[R][number][]
    const existing = rows.find(r => r.externalId === row.externalId)
    if (rows.some(r => r !== existing && ('email' in row && 'email' in r && r.email.toLowerCase() === row.email.toLowerCase() || 'name' in row && 'name' in r && r.name === row.name))) { reject(section, index, 'Email или название уже используется другой записью.'); return }
    if (existing) {
      const changed = Object.keys(row).some(key => !['id', 'version', 'createdAt', 'updatedAt', 'hasPassword'].includes(key) && JSON.stringify(row[key as keyof typeof row]) !== JSON.stringify(existing[key as keyof typeof existing]))
      if (changed) { Object.assign(existing, row, { id: existing.id, ...('version' in existing ? { version: existing.version + 1 } : {}) }); report[section].updated++ }
      else report[section].unchanged++
    } else { rows.push(row); report[section].created++ }
  }
  const seen = new Set<string>()
  for (const section of sections) {
    report[section].total = input[section].length
    for (let index = 0; index < input[section].length; index++) {
      const raw = input[section][index] as unknown as Record<string, unknown>
      const key = `${section}:${raw.externalId}`
      if (['accounts', 'groups', 'rooms', 'disciplines'].includes(section) && (!requireText(raw.externalId) || seen.has(key))) { reject(section, index, 'Нужен уникальный непустой externalId.'); continue }
      seen.add(key)
      const now = new Date().toISOString()
      if (section === 'accounts') {
        const r = raw as unknown as Import['accounts'][number]
        if (!requireText(r.firstName) || !requireText(r.lastName) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) || !['ADMIN', 'ORGANIZER', 'TEACHER', 'STUDENT'].includes(r.role) || !timeZoneValid(r.timeZone)) { reject(section, index, 'Проверьте ФИО, email, роль и часовой пояс.'); continue }
        upsert('accounts', { id: nextId(db.accounts), version: 1, email: r.email, externalId: r.externalId, firstName: r.firstName, lastName: r.lastName, patronymic: r.patronymic ?? null, role: r.role, timeZone: r.timeZone, enabled: true, hasPassword: Boolean(r.passwordHash), createdAt: now, updatedAt: now }, index)
      } else if (section === 'disciplines') {
        if (!requireText(raw.name)) { reject(section, index, 'Укажите название дисциплины.'); continue }
        upsert('disciplines', { id: nextId(db.disciplines), version: 1, active: true, externalId: String(raw.externalId), name: String(raw.name) }, index)
      } else if (section === 'groups') {
        if (!Array.isArray(raw.students) || raw.students.some(id => !db.accounts.some(a => a.externalId === id && a.role === 'STUDENT'))) { reject(section, index, 'В students указаны неизвестные студенты.'); continue }
        upsert('groups', { id: nextId(db.groups), version: 1, active: true, externalId: String(raw.externalId), name: String(raw.name || raw.externalId), studentIds: [...new Set(raw.students.map(id => external(db.accounts, id)!))] }, index)
      } else if (section === 'rooms') {
        if (raw.online != null && typeof raw.online !== 'boolean' || !raw.online && (!Number.isInteger(raw.capacity) || Number(raw.capacity) < 1) || !Array.isArray(raw.equipment) || raw.equipment.some(e => !requireText(e))) { reject(section, index, 'Проверьте вместимость, online и массив equipment.'); continue }
        const equipmentIds = (raw.equipment as string[]).map(name => { let equipment = db.equipment.find(e => e.name === name); if (!equipment) { equipment = { id: nextId(db.equipment), name }; db.equipment.push(equipment) } return equipment.id })
        upsert('rooms', { id: nextId(db.rooms), version: 1, active: true, externalId: String(raw.externalId), name: String(raw.name || raw.externalId), capacity: raw.online ? null : Number(raw.capacity), building: raw.building ? String(raw.building) : null, online: Boolean(raw.online), equipmentIds }, index)
      } else if (section === 'teaching') {
        const teacherId = external(db.accounts, raw.teacher), groupId = external(db.groups, raw.group), disciplineId = external(db.disciplines, raw.discipline)
        if (!teacherId || !groupId || !disciplineId || db.accounts.find(a => a.id === teacherId)?.role !== 'TEACHER') { reject(section, index, 'Не найдены преподаватель, группа или дисциплина.'); continue }
        if (db.teachings.some(t => t.teacherId === teacherId && t.groupId === groupId && t.disciplineId === disciplineId)) report[section].unchanged++
        else { db.teachings.push({ id: nextId(db.teachings), teacherId, groupId, disciplineId }); report[section].created++ }
      } else if (section === 'supervision') {
        const studentId = external(db.accounts, raw.student), supervisorId = external(db.accounts, raw.supervisor)
        if (!studentId || !supervisorId || db.accounts.find(a => a.id === studentId)?.role !== 'STUDENT' || db.accounts.find(a => a.id === supervisorId)?.role !== 'TEACHER') { reject(section, index, 'Не найдены студент или научный руководитель.'); continue }
        if (db.supervisions.some(s => s.studentId === studentId && s.supervisorId === supervisorId)) report[section].unchanged++
        else { db.supervisions.push({ studentId, supervisorId }); report[section].created++ }
      } else {
        const accountId = external(db.accounts, raw.account), roomId = external(db.rooms, raw.room)
        if (raw.account && !accountId || raw.room && !roomId || !accountId && !roomId || !Number.isFinite(Date.parse(String(raw.start))) || !Number.isFinite(Date.parse(String(raw.end))) || Date.parse(String(raw.start)) >= Date.parse(String(raw.end))) { reject(section, index, 'Проверьте ссылки на участника / аудиторию и время начала и конца.'); continue }
        upsert('timetable', { id: nextId(db.timetable), externalId: `import:${raw.account ?? ''}:${raw.room ?? ''}:${raw.start}:${raw.end}`, accountId: accountId ?? null, roomId: roomId ?? null, startsAt: String(raw.start), endsAt: String(raw.end), description: null }, index)
      }
    }
  }
  const summary = Object.values(report).reduce((a, c) => ({ total: a.total + c.total, created: a.created + c.created, updated: a.updated + c.updated, unchanged: a.unchanged + c.unchanged, rejected: a.rejected + c.rejected }), counts())
  const applied = !dryRun && (!summary.rejected || allowPartial)
  if (applied) writeDatabase(db)
  return { allowPartial, applied, dryRun, diagnostics, sections: report, summary }
}
