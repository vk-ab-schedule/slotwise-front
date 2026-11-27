import { api } from '../api/client'
import { hasStatus } from '../api/errors'
import { isMockMode } from '../api/mode'
import { loadPages } from '../api/page'
import { authStore } from '../auth/authStore'
import { getRules } from '../management/rules'
import type { Schema } from '../management/types'
import { scheduleDemo } from './demoRepository'
import type { SolveRequest } from './model'

const getJob = (id: number) => api('get', '/api/jobs/{id}', { path: { id } })
const jobKey = (id: number) => `slotwise-api-job:${authStore.user?.id}:${id}`

const scheduleApi = {
  listSessions: () => loadPages(page => api('get', '/api/sessions', { query: { page, size: 100 } })),
  async getSession(id: number) {
    const [session, rules] = await Promise.all([api('get', '/api/sessions/{id}', { path: { id } }), getRules(id)])
    return { session, rules }
  },
  listSolvers: () => api('get', '/api/solvers', {}),
  precheck: (id: number, expectedInputVersion: number) =>
    api('post', '/api/sessions/{id}/precheck', { path: { id }, body: { expectedInputVersion } }),
  async startJob(id: number, body: SolveRequest) {
    const key = jobKey(id)
    const job = await api('post', '/api/sessions/{id}/solve', { path: { id }, body })
    sessionStorage.setItem(key, String(job.id))
    return job
  },
  getJob,
  async latestJob(id: number) {
    // The backend exposes lookup by job ID. Keep the ID across reloads of this tab.
    const key = jobKey(id)
    const jobId = Number(sessionStorage.getItem(key))
    if (!Number.isSafeInteger(jobId) || jobId < 1) return null
    try {
      const job = await getJob(jobId)
      if (job.sessionId === id) return job
    } catch (error) {
      if (!hasStatus(error, 404)) throw error
    }
    sessionStorage.removeItem(key)
    return null
  },
  listVariants: (id: number) =>
    loadPages(page => api('get', '/api/sessions/{id}/variants', { path: { id }, query: { page, size: 100 } })),
  getVariant: (id: number) => api('get', '/api/variants/{id}', { path: { id } }),
  personalSchedule: (from: string, to: string) => api('get', '/api/me/schedule', { query: { from, to } }),
} satisfies typeof scheduleDemo

export const scheduleRepository = isMockMode() ? scheduleDemo : scheduleApi

export const publishVariant = (id: number, body: Schema['PublishVariantRequest']) =>
  api('post', '/api/variants/{id}/publish', { path: { id }, body })

export const updateAssignment = (id: number, eventId: number, body: Schema['AssignmentUpdateRequest'], dryRun: boolean) =>
  api('patch', '/api/variants/{id}/assignments/{eventId}', { path: { id, eventId }, query: { dryRun }, body })
