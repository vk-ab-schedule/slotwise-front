import type { components } from '../api/schema'

type Schema = components['schemas']

export type BusyCalendar = Schema['BusyCalendarResponse']
export type BusyInterval = Schema['Interval']
export type Importance = Schema['BusyImportance']
export type IntervalInput = Schema['IntervalRequest']
