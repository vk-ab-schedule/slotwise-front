import type { Assignment, ScheduleEvent, Variant } from './model'

export const demoWeek = '2026-06-15'
const room = { id: 1, name: '2426', building: 'Кронверкский, 49', online: false }
const online = { id: 2, name: 'Онлайн-площадка', building: null, online: true }
const teacher = { accountId: 2, firstName: 'Мария', lastName: 'Петрова', patronymic: null, role: 'SUPERVISOR' } as const
const student = { accountId: 1, firstName: 'Александр', lastName: 'Смирнов', patronymic: null, role: 'STUDENT' } as const
const commission = [{ accountId: 5, firstName: 'Иван', lastName: 'Павлов', patronymic: null, chair: true }]

export const publishedEvents: ScheduleEvent[] = [
  event(101, 'Консультация с руководителем', '2026-06-15', '06:00', '06:30', 3, online),
  event(102, 'Предзащита ВКР', '2026-06-16', '10:00', '10:30', 4, room),
  event(103, 'Защита ВКР', '2026-06-19', '08:00', '08:30', 5, room),
]

function event(id: number, title: string, day: string, start: string, end: string, eventTypeId: number, location: typeof room | typeof online): ScheduleEvent {
  return {
    eventId: id, eventTypeId, title, startsAt: `${day}T${start}:00Z`, endsAt: `${day}T${end}:00Z`,
    sessionId: 1, sessionName: 'Защиты ВКР · P3410', variantId: 1, changed: id === 103,
    format: location.online ? 'ONLINE' : 'ONSITE', room: location,
    participants: [student, teacher], commissionMembers: location.online ? [] : commission,
  }
}

export const publishedVariant: Variant = {
  id: 1, sessionId: 1, solverJobId: 1, inputSnapshotId: 1, inputVersion: 1, currentInputVersion: 1,
  version: 1, baseVariantId: null, createdAt: '2026-06-11T08:00:00Z', publishedAt: '2026-06-12T08:00:00Z',
  publishedBy: 3, status: 'PUBLISHED', algorithm: 'CP_SAT', parameters: { seed: 42, timeLimitSeconds: 60 },
  incompleteData: false, staleData: false, nonRespondentIds: [], issues: [],
  assignments: publishedEvents.map((event): Assignment => ({
    eventId: event.eventId, eventTypeId: event.eventTypeId, title: event.title,
    startsAt: event.startsAt, endsAt: event.endsAt, format: event.format, room: event.room,
    participants: event.participants, commissionMembers: event.commissionMembers,
    durationMinutes: 30, status: 'ASSIGNED', issues: [], locked: false, version: 1,
  })),
  metrics: demoMetrics(0, 'OPTIMAL', 0, 2300),
}

export function demoMetrics(unassignedEvents: number, solveStatus: Variant['metrics']['solveStatus'], loadMinutes: number, runtimeMillis: number): Variant['metrics'] {
  return {
    unassignedEvents, solveStatus, runtimeMillis, hardViolations: 0, penalty: loadMinutes * 5,
    bestBound: solveStatus === 'OPTIMAL' ? loadMinutes * 5 : null, gap: solveStatus === 'OPTIMAL' ? 0 : null,
    gapsHours: 0, commissionLoadRangeHours: loadMinutes / 60, commissionLoadStandardDeviationHours: 0,
    teacherRoomChanges: 0, undesirableEvents: 0,
    scoreComponents: [
      { constraint: 'S1', rawPenalty: 0, weight: 3, weightedPenalty: 0 },
      { constraint: 'S2', rawPenalty: loadMinutes, weight: 5, weightedPenalty: loadMinutes * 5 },
      { constraint: 'S3', rawPenalty: 0, weight: 4, weightedPenalty: 0 },
      { constraint: 'S4', rawPenalty: 0, weight: 2, weightedPenalty: 0 },
      { constraint: 'S5', rawPenalty: 0, weight: 0, weightedPenalty: 0 },
    ],
  }
}
