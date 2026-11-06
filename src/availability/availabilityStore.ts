import { makeAutoObservable, runInAction } from 'mobx'
import { AxiosError } from 'axios'
import { getCalendar, replaceCalendar, submitCalendar } from './repository'
import type { BusyCalendar, IntervalInput } from './types'

function errorMessage(error: unknown) {
  if (error instanceof AxiosError) return (error.response?.data as { detail?: string })?.detail ?? 'Не удалось сохранить занятость.'
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос.'
}

export class AvailabilityStore {
  calendar: BusyCalendar | null = null
  loading = false
  saving = false
  error = ''
  success = ''

  constructor() { makeAutoObservable(this) }

  async load() {
    this.loading = true
    this.error = ''
    try { const calendar = await getCalendar(); runInAction(() => { this.calendar = calendar }) }
    catch (error) { runInAction(() => { this.error = errorMessage(error) }) }
    finally { runInAction(() => { this.loading = false }) }
  }

  async save(intervals: IntervalInput[]) {
    if (!this.calendar) return false
    this.saving = true
    this.error = ''
    this.success = ''
    try {
      const calendar = await replaceCalendar(this.calendar.revision, intervals)
      runInAction(() => { this.calendar = calendar; this.success = 'Интервалы сохранены.' })
      return true
    } catch (error) { runInAction(() => { this.error = errorMessage(error) }); return false }
    finally { runInAction(() => { this.saving = false }) }
  }

  async submit() {
    if (!this.calendar) return false
    this.saving = true
    this.error = ''
    try {
      const calendar = await submitCalendar(this.calendar.revision)
      runInAction(() => { this.calendar = calendar; this.success = 'Занятость отправлена.' })
      return true
    } catch (error) { runInAction(() => { this.error = errorMessage(error) }); return false }
    finally { runInAction(() => { this.saving = false }) }
  }

  clearMessages() { this.error = ''; this.success = '' }
}

export const availabilityStore = new AvailabilityStore()
