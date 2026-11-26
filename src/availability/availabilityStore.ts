import { makeAutoObservable, runInAction } from 'mobx'
import { errorMessage } from '../api/errors'
import { getCalendar, replaceCalendar, submitCalendar } from './repository'
import type { BusyCalendar, IntervalInput } from './types'

export class AvailabilityStore {
  calendar: BusyCalendar | null = null
  loading = false
  saving = false
  error = ''
  success = ''

  constructor(readonly sessionId: number) { makeAutoObservable(this) }

  async load() {
    this.loading = true
    this.error = ''
    try { const calendar = await getCalendar(this.sessionId); runInAction(() => { this.calendar = calendar }) }
    catch (error) { runInAction(() => { this.error = errorMessage(error) }) }
    finally { runInAction(() => { this.loading = false }) }
  }

  async save(intervals: IntervalInput[]) {
    if (!this.calendar) return false
    this.saving = true
    this.error = ''
    this.success = ''
    try {
      const calendar = await replaceCalendar(this.sessionId, this.calendar.revision, intervals)
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
      const calendar = await submitCalendar(this.sessionId, this.calendar.revision)
      runInAction(() => { this.calendar = calendar; this.success = 'Занятость отправлена.' })
      return true
    } catch (error) { runInAction(() => { this.error = errorMessage(error) }); return false }
    finally { runInAction(() => { this.saving = false }) }
  }

  clearMessages() { this.error = ''; this.success = '' }
}
