import type { components } from '../api/schema'

type Schemas = components['schemas']

export type BusyCalendar = Schemas['BusyCalendarResponse']
export type Importance = Schemas['BusyImportance']
export type BusyInterval = Schemas['Interval']
export type IntervalInput = Schemas['IntervalRequest']
export type ReplaceCalendarRequest = Schemas['ReplaceRequest']
export type SubmitCalendarRequest = Schemas['SubmitRequest']
