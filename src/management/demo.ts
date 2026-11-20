import type { Database, Schema } from './types'

export const defaultRules = (version = 1): Schema['SessionRulesResponse'] => ({
  defaultAlgorithm: 'CP_SAT', inputVersion: version, sessionVersion: version,
  roomChangeBufferMinutes: 15, seed: 42, slotMinutes: 5, timeLimitSeconds: 60,
  weights: { teacherGaps: 3, commissionLoadSpread: 5, undesirableTime: 4, teacherRoomChanges: 2, movedEvents: 0 },
})

export function initialDatabase(): Database {
  const now = '2026-06-01T09:00:00Z'
  const accounts: Database['accounts'] = [
    { id: 1, firstName: 'Александр', lastName: 'Смирнов', role: 'STUDENT', email: 'student@example.test' },
    { id: 2, firstName: 'Мария', lastName: 'Петрова', role: 'TEACHER', email: 'teacher@example.test' },
    { id: 3, firstName: 'Анна', lastName: 'Иванова', role: 'ORGANIZER', email: 'organizer@example.test' },
    { id: 4, firstName: 'Андрей', lastName: 'Администраторов', role: 'ADMIN', email: 'admin@example.test' },
    { id: 5, firstName: 'Иван', lastName: 'Павлов', role: 'TEACHER', email: 'pavlov@example.test' },
    { id: 6, firstName: 'Елена', lastName: 'Орлова', role: 'TEACHER', email: 'orlova@example.test' },
  ].map(p => ({ ...p, patronymic: null, externalId: `person-${p.id}`, enabled: true, hasPassword: true, timeZone: 'Europe/Moscow', version: 1, createdAt: now, updatedAt: now })) as Database['accounts']
  const template: Schema['CreateEventTypeRequest'] = { name: '', active: true, defaultDurationMinutes: 30, defaultFormat: 'ONSITE', granularity: 'PER_STUDENT', commissionSize: 0, requiresChair: false, participantRoles: ['STUDENT', 'SUPERVISOR'], preparationDays: 0, dependencies: [], equipmentIds: [] }
  return {
    accounts,
    groups: [{ id: 1, name: 'P3410', externalId: 'P3410', studentIds: [1], active: true, version: 1 }],
    rooms: [{ id: 1, name: '2426', building: 'Кронверкский, 49', capacity: 30, online: false, equipmentIds: [1], externalId: 'room-2426', active: true, version: 1 }, { id: 2, name: 'Онлайн-площадка', building: null, capacity: null, online: true, equipmentIds: [], externalId: 'online', active: true, version: 1 }],
    disciplines: [{ id: 1, name: 'Проектирование систем', externalId: 'systems', active: true, version: 1 }],
    equipment: [{ id: 1, name: 'Проектор' }],
    teachings: [{ id: 1, teacherId: 2, disciplineId: 1, groupId: 1 }],
    supervisions: [{ studentId: 1, supervisorId: 2 }],
    timetable: [{ id: 1, accountId: 1, roomId: 1, startsAt: '2026-06-15T07:00:00Z', endsAt: '2026-06-15T08:30:00Z', description: 'Учебная пара', externalId: 'pair-1' }],
    'event-types': [
      { ...template, id: 1, version: 1, name: 'Экзамен по дисциплине', defaultDurationMinutes: 90, granularity: 'PER_GROUP', participantRoles: ['STUDENT', 'DISCIPLINE_TEACHER'], preparationDays: 2 },
      { ...template, id: 2, version: 1, name: 'Консультация по дисциплине', granularity: 'PER_GROUP', participantRoles: ['STUDENT', 'DISCIPLINE_TEACHER'] },
      { ...template, id: 3, version: 1, name: 'Консультация с научным руководителем', defaultFormat: 'ONLINE' },
      { ...template, id: 4, version: 1, name: 'Предзащита', commissionSize: 3 },
      { ...template, id: 5, version: 1, name: 'Защита ВКР', commissionSize: 3, requiresChair: true, equipmentIds: [1], dependencies: [{ predecessorTypeId: 4, minGapDays: 3, maxGapDays: null }] },
    ],
    sessions: [{ id: 1, version: 1, inputVersion: 1, organizerId: 3, name: 'Защиты ВКР · P3410', timeZone: 'Europe/Moscow', startsAt: '2026-06-14T21:00:00Z', endsAt: '2026-06-26T15:00:00Z', workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'], workingDayStart: '09:00:00', workingDayEnd: '18:00:00', collectionStartsAt: now, collectionEndsAt: '2026-06-10T15:00:00Z', collectionStatus: 'OPEN', createdAt: now }],
    rules: { 1: defaultRules() },
    selections: { 1: { participants: { sessionId: 1, sessionVersion: 1, inputVersion: 1, studyGroupIds: [1], accountIds: [], participants: [accounts[0]] }, rooms: { sessionId: 1, sessionVersion: 1, inputVersion: 1, roomIds: [1] }, commission: { sessionId: 1, sessionVersion: 1, inputVersion: 1, candidates: [{ accountId: 2, canChair: true }, { accountId: 5, canChair: false }, { accountId: 6, canChair: false }] } } },
  }
}
