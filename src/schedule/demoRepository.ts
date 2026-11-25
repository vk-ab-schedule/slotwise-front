import { localDate, zonedDateTimeToIso } from '../availability/time'
import { authStore } from '../auth/authStore'
import { assertVersion, readDatabase } from '../management/repository'
import { ownedSession } from '../management/sessions'
import type { Database, Schema } from '../management/types'
import { addDays } from './dates'
import { demoMetrics, publishedEvents, publishedVariant } from './demoFixtures'
import { algorithmLabels, isActiveJob, type Assignment, type Session, type SolveRequest, type SolverJob, type Variant } from './model'

const storageKey = 'slotwise-demo-schedule-v1'
const queueMillis = 1800
const runMillis = 4200
const weekdays = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const
type DemoRun = { job: SolverJob; variant: Variant | null }

function readRuns(): DemoRun[] {
  const stored = localStorage.getItem(storageKey)
  return stored ? JSON.parse(stored) as DemoRun[] : []
}

function currentJob({ job, variant }: DemoRun, now = Date.now()): SolverJob {
  const start = Date.parse(job.createdAt) + queueMillis
  const finish = start + Math.min(runMillis, job.parameters.timeLimitSeconds * 1000)
  if (now < start) return job
  const quality = variant && { unassignedEvents: variant.metrics.unassignedEvents, penalty: variant.metrics.penalty ?? 0, bestBound: variant.metrics.bestBound }
  const running: SolverJob = { ...job, status: 'RUNNING', queuePosition: null, startedAt: new Date(start).toISOString(), version: 2 }
  if (now < finish) {
    const progress = (now - start) / (finish - start)
    return { ...running, progress, quality: progress >= 0.45 ? quality : null }
  }
  return {
    ...running, status: 'COMPLETED', progress: 1, quality, version: 3,
    resultId: variant?.id ?? null, finishedAt: new Date(finish).toISOString(),
    solveStatus: variant?.metrics.solveStatus ?? 'NO_SOLUTION',
  }
}

function diagnostics(events: Schema['EventResponse'][]): Schema['ApiIssue'][] {
  return events.filter(event => !event.complete).map(event => ({
    code: 'INCOMPLETE_EVENT', severity: 'WARNING', message: `«${event.title}»: требования к событию заполнены не полностью.`,
    eventIds: [event.id], accountIds: [], roomIds: [],
  }))
}

function sessionInputs(id: number) {
  const db = readDatabase()
  const session = ownedSession(db, id)
  return { db, session, events: db.events.filter(event => event.sessionId === id) }
}

function precheck(session: Session, events: Schema['EventResponse'][]): Schema['PrecheckResponse'] {
  const issues = diagnostics(events)
  if (!events.length) issues.push({
    code: 'NO_EVENTS', severity: 'WARNING', message: 'Добавьте события на вкладке «События».',
    eventIds: [], accountIds: [], roomIds: [],
  })
  return { sessionId: session.id, inputVersion: session.inputVersion, incompleteData: session.collectionStatus !== 'CLOSED', nonRespondentIds: [], issues }
}

function demoAssignments(db: Database, session: Session, events: Schema['EventResponse'][], issues: Schema['ApiIssue'][]): Assignment[] {
  const selection = db.selections[session.id]
  const people = new Map(db.accounts.map(person => [person.id, person]))
  const selectedRooms = db.rooms.filter(room => room.active && (room.online || selection?.rooms.roomIds.includes(room.id)))
  const firstDay = localDate(session.startsAt, session.timeZone)
  const lastDay = localDate(session.endsAt, session.timeZone)
  let day = firstDay
  return events.map(event => {
    const participants = event.participants.flatMap(({ accountId, role }) => {
      const person = people.get(accountId)
      return person ? [{ accountId, role, firstName: person.firstName, lastName: person.lastName, patronymic: person.patronymic }] : []
    })
    const room = selectedRooms.find(room => room.online === (event.format === 'ONLINE') &&
      (room.capacity === null || room.capacity >= participants.length + event.commissionSize) &&
      event.equipmentIds.every(id => room.equipmentIds.includes(id)))
    const eventIssues = issues.filter(issue => issue.eventIds.includes(event.id))
    const assignment: Assignment = {
      eventId: event.id, eventTypeId: event.eventTypeId, title: event.title, format: event.format, durationMinutes: event.durationMinutes,
      participants, commissionMembers: [], status: 'UNASSIGNED', startsAt: null, endsAt: null, room: null,
      locked: false, version: 1, issues: eventIssues,
    }
    // Sample slots exercise the calendar. Real constraint evaluation belongs to the solver.
    if (event.complete && room && !event.commissionSize && !event.dependencies.length) {
      while (day <= lastDay) {
        const slotDay = day
        day = addDays(day, 1)
        const weekday = weekdays[new Date(`${slotDay}T00:00:00Z`).getUTCDay()]
        if (!session.workingDays.includes(weekday)) continue
        const startsAt = zonedDateTimeToIso(slotDay, session.workingDayStart, session.timeZone)
        const endsAt = new Date(Date.parse(startsAt) + event.durationMinutes * 60_000).toISOString()
        const closesAt = zonedDateTimeToIso(slotDay, session.workingDayEnd, session.timeZone)
        if (Date.parse(startsAt) < Date.parse(session.startsAt)) continue
        if (Date.parse(endsAt) > Math.min(Date.parse(closesAt), Date.parse(session.endsAt))) continue
        return { ...assignment, status: 'ASSIGNED', startsAt, endsAt, room: { id: room.id, name: room.name, building: room.building, online: room.online } }
      }
    }
    return assignment
  })
}

export const scheduleDemo = {
  async listSessions() {
    return readDatabase().sessions.filter(session => session.organizerId === authStore.user?.id)
  },
  async getSession(id: number) {
    const { db, session } = sessionInputs(id)
    return { session, rules: db.rules[id] }
  },
  async listSolvers(): Promise<Schema['SolverDescriptorResponse'][]> {
    return [
      { algorithm: 'CP_SAT', name: algorithmLabels.CP_SAT, available: true, description: 'CP-SAT', supportsBestBound: true },
      { algorithm: 'GREEDY', name: algorithmLabels.GREEDY, available: true, description: 'Базовый алгоритм', supportsBestBound: false },
    ]
  },
  async precheck(id: number, expectedInputVersion: number) {
    const { session, events } = sessionInputs(id)
    assertVersion(session.inputVersion, expectedInputVersion)
    return precheck(session, events)
  },
  async startJob(id: number, request: SolveRequest) {
    const { db, session, events } = sessionInputs(id)
    assertVersion(session.inputVersion, request.expectedInputVersion)
    if (!events.length) throw new Error('Добавьте события перед запуском расчёта.')
    if (request.algorithm === 'TIMEFOLD') throw new Error('Алгоритм Timefold недоступен.')
    if (!Number.isInteger(request.timeLimitSeconds) || request.timeLimitSeconds < 1 || request.timeLimitSeconds > 300 || !Number.isSafeInteger(request.seed)) {
      throw new Error('Укажите целый лимит от 1 до 300 секунд и целый seed.')
    }
    const runs = readRuns()
    const active = runs.find(run => run.job.sessionId === id && isActiveJob(currentJob(run)))
    if (active) return currentJob(active)
    const now = Date.now()
    const jobId = (runs.at(-1)?.job.id ?? 1) + 1
    const createdAt = new Date(now).toISOString()
    const parameters = { seed: request.seed, timeLimitSeconds: request.timeLimitSeconds }
    const job: SolverJob = {
      id: jobId, sessionId: id, inputSnapshotId: jobId, inputVersion: session.inputVersion, algorithm: request.algorithm, parameters,
      baseVariantId: null, status: 'QUEUED', queuePosition: 1, progress: null, quality: null, error: null, resultId: null,
      solveStatus: null, createdAt, startedAt: null, finishedAt: null, version: 1,
    }
    const check = precheck(session, events)
    const assignments = demoAssignments(db, session, events, check.issues)
    const variant: Variant | null = request.timeLimitSeconds === 1 ? null : {
      id: jobId, sessionId: id, solverJobId: jobId, inputSnapshotId: jobId, inputVersion: session.inputVersion, currentInputVersion: session.inputVersion,
      version: 1, baseVariantId: null, createdAt: new Date(now + queueMillis + Math.min(runMillis, request.timeLimitSeconds * 1000)).toISOString(),
      publishedAt: null, publishedBy: null, status: 'DRAFT', algorithm: request.algorithm, parameters,
      incompleteData: check.incompleteData, nonRespondentIds: [], issues: check.issues, staleData: false, assignments,
      metrics: demoMetrics(assignments.filter(event => event.status === 'UNASSIGNED').length, 'FEASIBLE', 0, Math.min(runMillis, request.timeLimitSeconds * 1000)),
    }
    localStorage.setItem(storageKey, JSON.stringify([...runs, { job, variant }]))
    return job
  },
  async latestJob(id: number) {
    sessionInputs(id)
    const run = readRuns().reverse().find(run => run.job.sessionId === id)
    return run ? currentJob(run) : null
  },
  async getJob(id: number) {
    const run = readRuns().find(run => run.job.id === id)
    if (!run) throw new Error('Расчёт не найден.')
    sessionInputs(run.job.sessionId)
    return currentJob(run)
  },
  async listVariants(id: number): Promise<Schema['VariantSummaryResponse'][]> {
    const { session } = sessionInputs(id)
    const variants = readRuns().flatMap(run => run.variant?.sessionId === id && currentJob(run).resultId ? [run.variant] : [])
    if (id === publishedVariant.sessionId) variants.unshift(publishedVariant)
    return variants.reverse().map(variant => {
      const { id, sessionId, solverJobId, inputVersion, status, createdAt, publishedAt, algorithm, metrics, version, baseVariantId, incompleteData } = variant
      return { id, sessionId, solverJobId, inputVersion, status, createdAt, publishedAt, algorithm, metrics, version, baseVariantId, incompleteData,
        currentInputVersion: session.inputVersion, staleData: inputVersion !== session.inputVersion }
    })
  },
  async getVariant(id: number) {
    const run = readRuns().find(run => run.variant?.id === id)
    const variant = id === publishedVariant.id ? publishedVariant : run && currentJob(run).resultId ? run.variant : null
    if (!variant) throw new Error('Вариант расписания не найден.')
    const { session } = sessionInputs(variant.sessionId)
    return { ...variant, currentInputVersion: session.inputVersion, staleData: variant.inputVersion !== session.inputVersion }
  },
  async personalSchedule(from: string, to: string): Promise<Schema['PersonalScheduleResponse']> {
    const user = authStore.user
    if (!user || (user.role !== 'STUDENT' && user.role !== 'TEACHER')) throw new Error('Расписание недоступно для вашей роли.')
    const events = publishedEvents.filter(event =>
      Date.parse(event.startsAt) < Date.parse(to) && Date.parse(event.endsAt) > Date.parse(from) &&
      [...event.participants, ...event.commissionMembers].some(person => person.accountId === user.id))
    return { events, from, to, timeZone: user.timeZone }
  },
}
