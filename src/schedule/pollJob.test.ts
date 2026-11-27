import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SolverJob } from './model'
import { pollJob } from './pollJob'

const job = (status: SolverJob['status']) => ({ status } as SolverJob)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('stops polling when the job reaches a terminal state', async () => {
  const read = vi.fn().mockResolvedValueOnce(job('QUEUED')).mockResolvedValueOnce(job('RUNNING')).mockResolvedValue(job('COMPLETED'))
  const update = vi.fn()
  const onError = vi.fn()
  pollJob(read, update, onError)
  await vi.advanceTimersByTimeAsync(10_000)
  expect(update.mock.calls.map(([result]) => result.status)).toEqual(['QUEUED', 'RUNNING', 'COMPLETED'])
  expect(read).toHaveBeenCalledTimes(3)
  expect(onError).not.toHaveBeenCalled()
})

it('waits for each response and ignores a late response after leaving the screen', async () => {
  let resolve!: (value: SolverJob) => void
  const read = vi.fn(() => new Promise<SolverJob>(done => { resolve = done }))
  const update = vi.fn()
  const stop = pollJob(read, update, vi.fn())
  await vi.advanceTimersByTimeAsync(10_000)
  expect(read).toHaveBeenCalledTimes(1)
  stop()
  resolve(job('RUNNING'))
  await vi.advanceTimersByTimeAsync(10_000)
  expect(update).not.toHaveBeenCalled()
  expect(read).toHaveBeenCalledTimes(1)
})

it('reports an interrupted poll once and lets the caller retry', async () => {
  const error = new Error('Временно недоступно')
  const read = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(job('FAILED'))
  const update = vi.fn()
  const onError = vi.fn()
  pollJob(read, update, onError)
  await vi.advanceTimersByTimeAsync(5000)
  expect(read).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith(error)
  pollJob(read, update, onError)
  await vi.advanceTimersByTimeAsync(5000)
  expect(read).toHaveBeenCalledTimes(2)
  expect(update).toHaveBeenCalledWith(job('FAILED'))
})
