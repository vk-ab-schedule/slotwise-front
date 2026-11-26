import { isActiveJob, type SolverJob } from './model'

export function pollJob(
  read: () => Promise<SolverJob>,
  onUpdate: (job: SolverJob) => void,
  onError: (error: unknown) => void,
  interval = 1000,
) {
  let stopped = false
  let timeout: ReturnType<typeof setTimeout>
  const poll = async () => {
    try {
      const job = await read()
      if (stopped) return
      onUpdate(job)
      if (isActiveJob(job)) timeout = setTimeout(() => void poll(), interval)
    } catch (error) {
      if (!stopped) onError(error)
    }
  }
  timeout = setTimeout(() => void poll(), interval)
  return () => {
    stopped = true
    clearTimeout(timeout)
  }
}
