import { api } from '../api/client'
import { isMockMode } from '../api/mode'
import { assertVersion, readDatabase, writeDatabase } from './repository'
import { ownedSession } from './sessions'
import { loadPages } from '../api/page'
import { personName, type Schema } from './types'

export function uniqueEventParticipants(participants: Schema['EventParticipant'][]): Schema['EventParticipant'][] {
  const byAccount = new Map<number, Schema['EventParticipant']>()
  for (const participant of participants) {
    const existing = byAccount.get(participant.accountId)
    if (!existing || existing.role === 'DISCIPLINE_TEACHER' && participant.role === 'SUPERVISOR') {
      byAccount.set(participant.accountId, participant)
    }
  }
  return [...byAccount.values()]
}

export async function listEvents(id: number): Promise<Schema['EventResponse'][]> {
  if (isMockMode()) { const db = readDatabase(); ownedSession(db, id); return structuredClone(db.events.filter(e => e.sessionId === id)) }
  return loadPages(page => api('get', '/api/sessions/{id}/events', { path: { id }, query: { page, size: 100 } }))
}
export async function createEvents(id: number, input: Schema['CreateEventsRequest']): Promise<Schema['CreateEventsResponse']> {
  if (!isMockMode()) return api('post', '/api/sessions/{id}/events', { path: { id }, body: input })
  const db = readDatabase(), session = ownedSession(db, id), type = db['event-types'].find(t => t.id === input.eventTypeId && t.active)
  assertVersion(session.version, input.expectedVersion)
  if (!type) throw new Error('Выберите активный тип события.')
  const groups = db.groups.filter(g => input.studyGroupIds.includes(g.id))
  const studentIds = [...new Set([...input.studentIds, ...groups.flatMap(g => g.studentIds)])]
  const targets = type.granularity === 'PER_GROUP' ? groups.map(g => ({ label: g.name, students: g.studentIds, groupId: g.id })) : studentIds.map(studentId => ({ label: personName(db.accounts.find(a => a.id === studentId)!), students: [studentId], groupId: db.groups.find(g => g.studentIds.includes(studentId))?.id ?? null }))
  const issues: Schema['ApiIssue'][] = [], events: Schema['EventResponse'][] = []
  const activeTeacherIds = new Set(db.accounts.filter(account => account.enabled && account.role === 'TEACHER').map(account => account.id))
  const supervisorLinks = db.supervisions.filter(link => activeTeacherIds.has(link.supervisorId))
  for (const target of targets) {
    const supervisors = supervisorLinks.filter(link => target.students.includes(link.studentId))
    const missingSupervisors = type.participantRoles.includes('SUPERVISOR')
      ? target.students.filter(studentId => !supervisors.some(s => s.studentId === studentId))
      : []
    const teachers = db.teachings.filter(t => t.groupId === target.groupId && t.disciplineId === input.disciplineId).map(t => t.teacherId)
    const participants = uniqueEventParticipants([
      ...target.students.map(accountId => ({ accountId, role: 'STUDENT' as const })),
      ...(type.participantRoles.includes('SUPERVISOR') ? supervisors.map(s => ({ accountId: s.supervisorId, role: 'SUPERVISOR' as const })) : []),
      ...(type.participantRoles.includes('DISCIPLINE_TEACHER') ? teachers.map(accountId => ({ accountId, role: 'DISCIPLINE_TEACHER' as const })) : []),
    ])
    const missingTeacher = type.participantRoles.includes('DISCIPLINE_TEACHER') && teachers.length === 0
    const eventId = Math.max(0, ...db.events.map(e => e.id)) + 1
    const event: Schema['EventResponse'] = { id: eventId, version: 1, sessionId: id, eventTypeId: type.id, title: `${type.name} · ${target.label}`, studyGroupId: target.groupId, disciplineId: input.disciplineId ?? null, durationMinutes: type.defaultDurationMinutes, format: type.defaultFormat, granularity: type.granularity, commissionSize: type.commissionSize, requiresChair: type.requiresChair, equipmentIds: [...type.equipmentIds], preparationDays: type.preparationDays, description: null, participants, complete: missingSupervisors.length === 0 && !missingTeacher,
      dependencies: type.dependencies.flatMap(d => db.events.filter(e => e.sessionId === id && e.eventTypeId === d.predecessorTypeId && e.participants.some(p => p.role === 'STUDENT' && target.students.includes(p.accountId))).map(e => ({ predecessorEventId: e.id, minGapDays: d.minGapDays, maxGapDays: d.maxGapDays }))),
    }
    db.events.push(event); events.push(event)
    db.eventRoles[event.id] = [...type.participantRoles]
    db.eventDependencies[event.id] = structuredClone(type.dependencies)
    if (missingSupervisors.length > 0) issues.push({ code: 'MISSING_SUPERVISOR', severity: 'WARNING', message: `${event.title}: не найден научный руководитель. Событие сохранено как неполное.`, accountIds: missingSupervisors, eventIds: [event.id], roomIds: [] })
    if (missingTeacher) issues.push({ code: 'MISSING_TEACHER', severity: 'WARNING', message: `${event.title}: не найден преподаватель дисциплины. Событие сохранено как неполное.`, accountIds: [], eventIds: [event.id], roomIds: [] })
  }
  // Connect copied template dependencies regardless of which event type was created first.
  // A manually edited dependency list is never replaced by later template expansion.
  for (const event of db.events.filter(e => e.sessionId === id)) {
    const dependencies = db.eventDependencies[event.id]
    if (!dependencies) continue
    const studentIds = event.participants.filter(p => p.role === 'STUDENT').map(p => p.accountId)
    const resolved = dependencies.flatMap(d => db.events.filter(e => e.sessionId === id && e.eventTypeId === d.predecessorTypeId && e.participants.some(p => p.role === 'STUDENT' && studentIds.includes(p.accountId))).map(e => ({ predecessorEventId: e.id, minGapDays: d.minGapDays, maxGapDays: d.maxGapDays })))
    if (JSON.stringify(event.dependencies) !== JSON.stringify(resolved)) { event.dependencies = resolved; if (!events.some(e => e.id === event.id)) event.version++ }
  }
  if (events.length) { session.version++; session.inputVersion++; writeDatabase(db) }
  return { events: structuredClone(events), inputVersion: session.inputVersion, sessionVersion: session.version, issues }
}

export function validateEvent(input: Schema['UpdateEventRequest'], event: Schema['EventResponse'], events: Schema['EventResponse'][]): string {
  if (!input.title.trim() || !Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes % 5) return 'Задайте название и длительность, кратную 5 минутам.'
  if (!Number.isInteger(input.commissionSize) || input.commissionSize < 0 || input.requiresChair && !input.commissionSize || !Number.isInteger(input.preparationDays) || input.preparationDays < 0) return 'Проверьте размер комиссии и дни подготовки.'
  const graph = new Map(events.map(e => [e.id, e.dependencies.map(d => d.predecessorEventId)]))
  graph.set(event.id, input.dependencies.map(d => d.predecessorEventId))
  for (const d of input.dependencies) if (d.predecessorEventId === event.id || !events.some(e => e.id === d.predecessorEventId) || !Number.isInteger(d.minGapDays) || d.minGapDays < 0 || d.maxGapDays != null && (!Number.isInteger(d.maxGapDays) || d.maxGapDays < d.minGapDays)) return 'Проверьте предшествующие события и разрывы между ними.'
  const visiting = new Set<number>(), visited = new Set<number>()
  const visit = (id: number): boolean => { if (visiting.has(id)) return true; if (visited.has(id)) return false; visiting.add(id); if ((graph.get(id) ?? []).some(visit)) return true; visiting.delete(id); visited.add(id); return false }
  return visit(event.id) ? 'Зависимости событий образуют цикл.' : ''
}
export async function updateEvent(event: Schema['EventResponse'], input: Schema['UpdateEventRequest']): Promise<void> {
  input = { ...input, participants: uniqueEventParticipants(input.participants) }
  if (!isMockMode()) { await api('put', '/api/sessions/{id}/events/{eventId}', { path: { id: event.sessionId, eventId: event.id }, body: input }); return }
  const db = readDatabase(), session = ownedSession(db, event.sessionId), current = db.events.find(e => e.id === event.id)
  if (!current) throw new Error('Событие не найдено.')
  assertVersion(current.version, input.expectedVersion)
  const error = validateEvent(input, current, db.events.filter(e => e.sessionId === event.sessionId))
  if (error) throw new Error(error)
  const { expectedVersion: _version, ...fields } = input
  void _version
  const requiredRoles = db.eventRoles[current.id] ?? [...new Set(current.participants.map(p => p.role))]
  if (JSON.stringify(current.dependencies) !== JSON.stringify(input.dependencies)) db.eventDependencies[current.id] = null
  const coversRole = (role: Schema['ParticipantRole']) => input.participants.some(participant =>
    participant.role === role ||
    role === 'DISCIPLINE_TEACHER' && participant.role === 'SUPERVISOR' &&
      db.teachings.some(link => link.teacherId === participant.accountId &&
        link.disciplineId === current.disciplineId && link.groupId === current.studyGroupId),
  )
  Object.assign(current, fields, { version: current.version + 1, complete: coversRole('STUDENT') && requiredRoles.every(coversRole) })
  session.version++; session.inputVersion++; writeDatabase(db)
}
