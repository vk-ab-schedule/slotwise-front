import type { Schema } from '../management/types'

export type Variant = Schema['VariantResponse']
export type Assignment = Schema['AssignmentResponse']
export type ScheduleEvent = Schema['PersonalScheduleEventResponse']
export type Session = Schema['PlanningSessionResponse']
export type SolveRequest = Schema['SolveRequest']
export type SolverJob = Schema['SolverJobResponse'] & {
  quality: { unassignedEvents: number; penalty: number; bestBound: number | null } | null
}

export const algorithmLabels = { GREEDY: 'Greedy', CP_SAT: 'CP-SAT', TIMEFOLD: 'Timefold' }
export const formatLabels = { ONSITE: 'Очно', ONLINE: 'Онлайн', HYBRID: 'Гибрид' }
export const variantLabels = { DRAFT: 'Черновик', PUBLISHED: 'Опубликован', SUPERSEDED: 'Заменён' }
export const roleLabels = { STUDENT: 'Студент', DISCIPLINE_TEACHER: 'Преподаватель', SUPERVISOR: 'Руководитель' }
export const qualityLabels = {
  OPTIMAL: 'Оптимальность доказана',
  FEASIBLE: 'Решение найдено, оптимальность не доказана',
  NO_SOLUTION: 'Решение не найдено',
}

export const isActiveJob = (job: SolverJob) => job.status === 'QUEUED' || job.status === 'RUNNING'
export const personName = (person: { firstName: string; lastName: string; patronymic: string | null }) =>
  [person.lastName, person.firstName, person.patronymic].filter(Boolean).join(' ')

export const place = (room: Assignment['room'], format: Assignment['format']) =>
  [room?.building, room?.name].filter(Boolean).join(' · ') || (format === 'ONLINE' ? 'Онлайн' : 'Место не указано')
