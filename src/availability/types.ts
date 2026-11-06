export type Importance = 'CRITICAL' | 'MEDIUM' | 'LOW'
export type ResponseStatus = 'NOT_RESPONDED' | 'SUBMITTED'
export interface BusyInterval { id: number; startsAt: string; endsAt: string; importance: Importance }
export interface KnownBusy { startsAt: string; endsAt: string; description: string | null }
export interface ApiIssue { code?: string; message?: string; detail?: string }
export interface BusyCalendar {
  sessionId: number
  revision: string
  timeZone: string
  responseStatus: ResponseStatus
  submittedAt: string | null
  editable: boolean
  timetableAvailable: boolean
  intervals: BusyInterval[]
  knownBusy: KnownBusy[]
  issues: ApiIssue[]
}
export interface IntervalInput { startsAt: string; endsAt: string; importance: Importance }
