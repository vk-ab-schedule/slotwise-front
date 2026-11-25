import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStore } from '../auth/authStore'
import { createEvents } from '../management/events'
import { getRules, saveRules } from '../management/rules'
import { readDatabase, writeDatabase } from '../management/repository'
import { scheduleDemo } from './demoRepository'
import type { SolveRequest } from './model'

const request = async (timeLimitSeconds = 60): Promise<SolveRequest> => ({
  algorithm: 'CP_SAT', timeLimitSeconds, seed: -1, expectedInputVersion: (await scheduleDemo.getSession(1)).session.inputVersion,
})

async function generateConsultation() {
  const { session } = await scheduleDemo.getSession(1)
  return createEvents(1, { expectedVersion: session.version, eventTypeId: 3, studentIds: [1], studyGroupIds: [] })
}

beforeEach(() => {
  for (const key of ['localStorage', 'sessionStorage']) {
    const data = new Map<string, string>()
    vi.stubGlobal(key, {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    })
  }
  vi.stubEnv('VITE_MOCK_API', 'true')
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-04T09:00:00Z'))
  authStore.selectDemoRole('ORGANIZER')
})

afterEach(() => {
  authStore.user = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('schedule mocks', () => {
  it('runs one job per session, persists it, and exposes the draft only at completion', async () => {
    const generated = await generateConsultation()
    const input = await request()
    expect(await scheduleDemo.precheck(1, input.expectedInputVersion)).toMatchObject({ incompleteData: true, issues: [] })
    const job = await scheduleDemo.startJob(1, input)
    expect(job).toMatchObject({ status: 'QUEUED', queuePosition: 1, progress: null, resultId: null })
    expect((await scheduleDemo.startJob(1, { ...input, seed: 42 })).id).toBe(job.id)
    expect(await scheduleDemo.listVariants(1)).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(await scheduleDemo.latestJob(1)).toMatchObject({ id: job.id, status: 'RUNNING', quality: { unassignedEvents: 0 } })
    vi.advanceTimersByTime(2500)
    expect(await scheduleDemo.getJob(job.id)).toMatchObject({ status: 'COMPLETED', solveStatus: 'FEASIBLE', resultId: job.id })
    const variant = await scheduleDemo.getVariant(job.id)
    expect(variant).toMatchObject({ status: 'DRAFT', publishedAt: null, incompleteData: true, inputVersion: input.expectedInputVersion })
    expect(variant.assignments).toMatchObject([{ eventId: generated.events[0].id, status: 'ASSIGNED' }])
  })

  it('distinguishes a timeout without a solution from a technical failure', async () => {
    await generateConsultation()
    const job = await scheduleDemo.startJob(1, await request(1))
    vi.advanceTimersByTime(4000)
    expect(await scheduleDemo.getJob(job.id)).toMatchObject({ status: 'COMPLETED', solveStatus: 'NO_SOLUTION', resultId: null, error: null })
    expect(await scheduleDemo.listVariants(1)).toHaveLength(1)
  })

  it('rejects stale input and marks existing snapshots stale after rules change', async () => {
    await generateConsultation()
    const input = await request()
    const job = await scheduleDemo.startJob(1, input)
    const rules = await getRules(1)
    await saveRules(1, { ...rules, seed: 17 })
    await expect(scheduleDemo.precheck(1, input.expectedInputVersion)).rejects.toThrow('Данные изменились')
    await expect(scheduleDemo.startJob(1, input)).rejects.toThrow('Данные изменились')
    vi.advanceTimersByTime(6500)
    expect(await scheduleDemo.getVariant(job.id)).toMatchObject({ staleData: true, currentInputVersion: input.expectedInputVersion + 1 })
  })

  it('keeps drafts private and filters published events by participant and overlap', async () => {
    await generateConsultation()
    const job = await scheduleDemo.startJob(1, await request())
    vi.advanceTimersByTime(6500)
    authStore.selectDemoRole('STUDENT')
    const schedule = await scheduleDemo.personalSchedule('2026-06-19T08:15:00Z', '2026-06-19T09:00:00Z')
    expect(schedule.events).toMatchObject([{ variantId: 1, changed: true }])
    expect((await scheduleDemo.personalSchedule('2026-06-19T08:30:00Z', '2026-06-19T09:00:00Z')).events).toEqual([])
    await expect(scheduleDemo.getVariant(job.id)).rejects.toThrow('недоступна')
    await expect(scheduleDemo.getJob(job.id)).rejects.toThrow('недоступна')
  })

  it('keeps incomplete events in the draft with diagnostics', async () => {
    await generateConsultation()
    const db = readDatabase()
    db.events[0].complete = false
    writeDatabase(db)
    const input = await request()
    expect((await scheduleDemo.precheck(1, input.expectedInputVersion)).issues).toMatchObject([{ code: 'INCOMPLETE_EVENT' }])
    const job = await scheduleDemo.startJob(1, input)
    vi.advanceTimersByTime(6500)
    const { assignments, metrics } = await scheduleDemo.getVariant(job.id)
    expect(assignments).toMatchObject([{ status: 'UNASSIGNED', startsAt: null, issues: [{ code: 'INCOMPLETE_EVENT' }] }])
    expect(metrics.unassignedEvents).toBe(1)
  })
})
