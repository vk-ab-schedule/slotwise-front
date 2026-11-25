import type { components } from '../api/schema'

export type Schema = components['schemas']
export type ResourceMap = {
  accounts: Schema['AccountResponse']
  groups: Schema['UniversityGroupResponse']
  rooms: Schema['UniversityRoomResponse']
  disciplines: Schema['UniversityDisciplineResponse']
  equipment: Schema['UniversityEquipmentResponse']
  teachings: Schema['UniversityTeachingResponse']
  supervisions: Schema['UniversitySupervisionResponse']
  timetable: Schema['UniversityTimetableEntryResponse']
  'event-types': Schema['EventTypeResponse']
  sessions: Schema['PlanningSessionResponse']
}
export type Resource = keyof ResourceMap
export type WriteMap = {
  accounts: Schema['CreateAccountRequest']
  groups: Schema['CreateUniversityGroupRequest'] & { active?: boolean }
  rooms: Schema['CreateUniversityRoomRequest'] & { active?: boolean }
  disciplines: Schema['CreateUniversityDisciplineRequest'] & { active?: boolean }
  equipment: Schema['UniversityEquipmentRequest']
  teachings: Schema['UniversityTeachingRequest']
  supervisions: Schema['UniversitySupervisionRequest']
  timetable: Schema['UniversityTimetableEntryRequest']
  'event-types': Schema['CreateEventTypeRequest']
  sessions: Schema['CreatePlanningSessionRequest']
}
export type Page<T> = { items: T[]; page: number; size: number; totalElements: number; totalPages: number }
export type Database = { [R in Resource]: ResourceMap[R][] } & {
  rules: Record<number, Schema['SessionRulesResponse']>
  events: Schema['EventResponse'][]
  eventRoles: Record<number, Schema['ParticipantRole'][]>
  eventDependencies: Record<number, Schema['EventTypeDependency'][] | null>
  selections: Record<number, {
    participants: Schema['ParticipantsResponse']
    rooms: Schema['RoomsResponse']
    commission: Schema['CommissionPoolResponse']
  }>
}

export const roleLabels = { ADMIN: 'Администратор', ORGANIZER: 'Организатор', TEACHER: 'Преподаватель', STUDENT: 'Студент' }
export const formatLabels = { ONSITE: 'Очно', ONLINE: 'Онлайн', HYBRID: 'Гибридно' }
export const granularityLabels = { PER_STUDENT: 'На студента', PER_GROUP: 'На группу' }
export const participantLabels = { STUDENT: 'Студент / группа', DISCIPLINE_TEACHER: 'Преподаватель дисциплины', SUPERVISOR: 'Научный руководитель' }
export const dayLabels = { MONDAY: 'Пн', TUESDAY: 'Вт', WEDNESDAY: 'Ср', THURSDAY: 'Чт', FRIDAY: 'Пт', SATURDAY: 'Сб', SUNDAY: 'Вс' }
export const personName = (p: Pick<Schema['PersonSummary'], 'firstName' | 'lastName' | 'patronymic'>) => [p.lastName, p.firstName, p.patronymic].filter(Boolean).join(' ')
export const recordKey = (r: object) => 'id' in r ? String(r.id) : `${(r as Schema['UniversitySupervisionResponse']).studentId}/${(r as Schema['UniversitySupervisionResponse']).supervisorId}`
