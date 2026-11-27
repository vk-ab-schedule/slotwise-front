import { isMockMode } from '../api/mode'
import { deleteRecord } from './remoteRecords'
import { assertVersion, readDatabase, writeDatabase } from './repository'
import type { Schema } from './types'

export const emptyEventType: Schema['CreateEventTypeRequest'] = { name: '', defaultDurationMinutes: 30, defaultFormat: 'ONSITE', granularity: 'PER_STUDENT', participantRoles: ['STUDENT'], commissionSize: 0, requiresChair: false, preparationDays: 0, dependencies: [], equipmentIds: [], active: true }

export function validateEventType(input: Schema['CreateEventTypeRequest'], types: Schema['EventTypeResponse'][], id = -1): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!input.name.trim()) errors.name = 'Укажите название'
  if (!Number.isInteger(input.defaultDurationMinutes) || input.defaultDurationMinutes < 5 || input.defaultDurationMinutes % 5) errors.defaultDurationMinutes = 'Длительность должна быть положительной и кратной 5 минутам'
  if (!input.participantRoles.length) errors.participantRoles = 'Выберите хотя бы одну роль'
  if (input.requiresChair && input.commissionSize < 1) errors.commissionSize = 'Для председателя нужна комиссия'
  if (!Number.isSafeInteger(input.commissionSize) || input.commissionSize < 0) errors.commissionSize = 'Размер комиссии — целое неотрицательное число'
  if (!Number.isSafeInteger(input.preparationDays) || input.preparationDays < 0) errors.preparationDays = 'Дни подготовки — целое неотрицательное число'
  const predecessors = new Set<number>()
  for (const d of input.dependencies) {
    if (d.predecessorTypeId === id || !types.some(t => t.id === d.predecessorTypeId)) errors.dependencies = 'Выберите существующий предшествующий тип, отличный от текущего'
    if (predecessors.has(d.predecessorTypeId)) errors.dependencies = 'Один предшествующий тип нельзя выбрать дважды'
    predecessors.add(d.predecessorTypeId)
    if (!Number.isSafeInteger(d.minGapDays) || d.minGapDays < 0 || d.maxGapDays != null && (!Number.isSafeInteger(d.maxGapDays) || d.maxGapDays < d.minGapDays)) errors.dependencies = 'Разрыв задаётся целыми днями: 0 ≤ минимум ≤ максимум'
  }
  const graph = new Map(types.map(t => [t.id, t.dependencies.map(d => d.predecessorTypeId)]))
  graph.set(id, input.dependencies.map(d => d.predecessorTypeId))
  const visiting = new Set<number>(), visited = new Set<number>(), path: number[] = []
  function visit(node: number): boolean {
    if (visiting.has(node)) { path.push(node); return true }
    if (visited.has(node)) return false
    visiting.add(node); path.push(node)
    for (const next of graph.get(node) ?? []) if (visit(next)) return true
    visiting.delete(node); visited.add(node); path.pop(); return false
  }
  if (visit(id)) errors.dependencies = `Циклическая зависимость: ${path.map(n => n === id ? input.name || 'Новый тип' : types.find(t => t.id === n)?.name || n).join(' → ')}`
  return errors
}

export async function deleteEventType(type: Schema['EventTypeResponse']) {
  if (!isMockMode()) return deleteRecord['event-types'](type)
  const db = readDatabase(), current = db['event-types'].find(t => t.id === type.id)
  if (!current) throw new Error('Тип уже удалён.')
  assertVersion(current.version, type.version)
  if (db.events.some(e => e.eventTypeId === type.id) || db['event-types'].some(t => t.dependencies.some(d => d.predecessorTypeId === type.id))) throw new Error('Тип используется в событиях или зависимостях. Снимите отметку «Доступен для новых событий» вместо удаления.')
  db['event-types'] = db['event-types'].filter(t => t.id !== type.id)
  writeDatabase(db)
}
