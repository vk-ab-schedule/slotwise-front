import { http, isMockMode } from '../api/http'
import { assertVersion, readDatabase, writeDatabase } from './repository'
import { ownedSession } from './sessions'
import type { Schema } from './types'

export const weightLabels: Record<keyof Schema['Weights'], string> = {
  teacherGaps: 'S1 · Меньше окон у преподавателей', commissionLoadSpread: 'S2 · Равномерная нагрузка комиссии', undesirableTime: 'S3 · Учитывать нежелательное время', teacherRoomChanges: 'S4 · Меньше переходов между аудиториями', movedEvents: 'S5 · Меньше изменений при перестроении',
}
export function validateRules(value: Schema['SessionRulesResponse']): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of Object.keys(weightLabels) as (keyof Schema['Weights'])[]) if (!Number.isSafeInteger(value.weights[key]) || value.weights[key] < 0 || value.weights[key] > 2147483647) errors[key] = 'Введите целый вес от 0 до 2147483647'
  if (!Number.isSafeInteger(value.roomChangeBufferMinutes) || value.roomChangeBufferMinutes < 0 || value.roomChangeBufferMinutes % 5) errors.roomChangeBufferMinutes = 'Буфер должен быть неотрицательным и кратным 5 минутам'
  if (!Number.isSafeInteger(value.timeLimitSeconds) || value.timeLimitSeconds < 1 || value.timeLimitSeconds > 300) errors.timeLimitSeconds = 'Лимит — целое число от 1 до 300 секунд'
  if (!Number.isSafeInteger(value.seed)) errors.seed = 'Введите целый seed в безопасном диапазоне JavaScript'
  return errors
}
export async function getRules(id: number): Promise<Schema['SessionRulesResponse']> {
  if (!isMockMode()) return (await http.get<Schema['SessionRulesResponse']>(`/sessions/${id}/rules`)).data
  const db = readDatabase(), session = ownedSession(db, id)
  return { ...structuredClone(db.rules[id]), sessionVersion: session.version, inputVersion: session.inputVersion }
}
export async function saveRules(id: number, value: Schema['SessionRulesResponse']): Promise<Schema['SessionRulesResponse']> {
  const errors = validateRules(value)
  if (Object.keys(errors).length) throw new Error(Object.values(errors).join('\n'))
  const body: Schema['UpdateRequest'] = { expectedVersion: value.sessionVersion, weights: value.weights, roomChangeBufferMinutes: value.roomChangeBufferMinutes, defaultAlgorithm: value.defaultAlgorithm, timeLimitSeconds: value.timeLimitSeconds, seed: value.seed }
  if (!isMockMode()) return (await http.put<Schema['SessionRulesResponse']>(`/sessions/${id}/rules`, body)).data
  const db = readDatabase(), session = ownedSession(db, id)
  assertVersion(session.version, value.sessionVersion)
  session.version++; session.inputVersion++
  db.rules[id] = { ...value, sessionVersion: session.version, inputVersion: session.inputVersion }
  writeDatabase(db)
  return structuredClone(db.rules[id])
}
