import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStore } from '../auth/authStore'
import { http } from '../api/http'
import { allRecords, listRecords, managementStorageKey, readDatabase, saveRecord } from './repository'
import { initialDatabase, defaultRules } from './demo'
import { accountAction, deleteUniversityRecord } from './university'
import { createEvents, listEvents, updateEvent } from './events'
import { deleteEventType } from './eventTypes'
import { getRules, saveRules } from './rules'
import { getSelections, saveSelection } from './sessions'

export function memoryStorage() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key), clear: () => values.clear() }
}
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); vi.stubEnv('VITE_MOCK_API', 'true')
  authStore.selectDemoRole('ORGANIZER')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); authStore.user = null })

describe('persistent management repository', () => {
  it('persists creates and rejects stale edits without losing the newer value', async () => {
    const created = await saveRecord('groups', { name: 'P9999', studentIds: [] })
    expect((await listRecords('groups')).items.some(g => g.id === created.id)).toBe(true)
    await saveRecord('groups', { name: 'P9998', studentIds: [] }, created)
    await expect(saveRecord('groups', { name: 'P9997', studentIds: [] }, created)).rejects.toThrow('Данные изменились')
    expect(readDatabase().groups.find(g => g.id === created.id)?.name).toBe('P9998')
  })
  it('loads every page for catalog selectors and filters across pages', async () => {
    const db = initialDatabase()
    db.equipment = Array.from({ length: 45 }, (_, index) => ({ id: index + 1, name: `Equipment ${index + 1}` }))
    localStorage.setItem(managementStorageKey, JSON.stringify(db))
    expect(await allRecords('equipment')).toHaveLength(45)
    expect((await listRecords('equipment', 0, 'Equipment 45')).items[0].id).toBe(45)
  })
  it('keeps mock response shapes specific to each resource', async () => {
    const group = await saveRecord('groups', { name: 'P5555', studentIds: [] })
    expect(group).toHaveProperty('active', true)
    expect(group).not.toHaveProperty('enabled')
    expect(group).not.toHaveProperty('hasPassword')
    const equipment = await saveRecord('equipment', { name: 'Камера' })
    expect(equipment).toEqual({ id: 2, name: 'Камера' })
  })
  it('isolates organizer sessions', async () => {
    const db = initialDatabase(); db.sessions.push({ ...db.sessions[0], id: 2, organizerId: 99 })
    localStorage.setItem(managementStorageKey, JSON.stringify(db))
    expect((await allRecords('sessions')).map(s => s.id)).toEqual([1])
  })
  it('blocks deletion of a referenced room and permits deactivation', async () => {
    const room = readDatabase().rooms[0]
    await expect(deleteUniversityRecord('rooms', room)).rejects.toThrow('используется')
    await saveRecord('rooms', { ...room, active: false }, room)
    expect(readDatabase().rooms[0].active).toBe(false)
  })
  it('protects the last administrator and never stores a new password', async () => {
    authStore.selectDemoRole('ADMIN')
    const admin = readDatabase().accounts.find(a => a.role === 'ADMIN')!
    await expect(accountAction(admin, 'enabled', false)).rejects.toThrow('последнего')
    await expect(accountAction(admin, 'role', 'STUDENT')).rejects.toThrow('собственную')
    await accountAction(admin, 'password', 'new-test-password')
    expect(localStorage.getItem(managementStorageKey)).not.toContain('new-test-password')
  })
  it('increments session versions when shared data changes', async () => {
    const before = readDatabase().sessions[0]
    await saveRecord('equipment', { name: 'Экран' })
    expect(readDatabase().sessions[0].inputVersion).toBe(before.inputVersion + 1)
  })
  it('rejects duplicate supervision links', async () => {
    await expect(saveRecord('supervisions', { studentId: 1, supervisorId: 2 })).rejects.toThrow('уже существует')
    expect(readDatabase().supervisions).toHaveLength(1)
  })
  it('shares a current session version across resource and rule edits', async () => {
    const selections = await getSelections(1)
    const saved = await saveSelection(1, 'rooms', selections.rooms, 1)
    expect(saved.sessionVersion).toBe(2)
    await expect(saveRules(1, defaultRules())).rejects.toThrow('Данные изменились')
    const rules = await getRules(1)
    expect((await saveRules(1, rules)).sessionVersion).toBe(3)
  })
  it('copies templates into events and preserves them after template edits', async () => {
    const created = await createEvents(1, { eventTypeId: 4, expectedVersion: 1, studyGroupIds: [1], studentIds: [1] })
    expect(created.events).toHaveLength(1) // A group plus an explicit student does not duplicate the student.
    const template = readDatabase()['event-types'].find(t => t.id === 4)!
    await saveRecord('event-types', { ...template, defaultDurationMinutes: 60 }, template)
    expect((await listEvents(1))[0].durationMinutes).toBe(30)
    await expect(deleteEventType(readDatabase()['event-types'].find(t => t.id === 4)!)).rejects.toThrow('используется')
    const selections = await getSelections(1)
    await expect(saveSelection(1, 'participants', { ...selections.participants, studyGroupIds: [], accountIds: [] }, 2)).rejects.toThrow('используются в событиях')
  })
  it('reports a missing supervisor without creating a guessed event', async () => {
    const db = initialDatabase(); db.supervisions = []; localStorage.setItem(managementStorageKey, JSON.stringify(db))
    const result = await createEvents(1, { eventTypeId: 5, expectedVersion: 1, studyGroupIds: [1], studentIds: [] })
    expect(result.events).toHaveLength(0)
    expect(result.issues[0].code).toBe('MISSING_SUPERVISOR')
    expect(readDatabase().sessions[0].version).toBe(1)
  })
  it('resolves template dependencies even when a defense was created first', async () => {
    await createEvents(1, { eventTypeId: 5, expectedVersion: 1, studyGroupIds: [1], studentIds: [] })
    await createEvents(1, { eventTypeId: 4, expectedVersion: 2, studyGroupIds: [1], studentIds: [] })
    expect((await listEvents(1)).find(e => e.eventTypeId === 5)?.dependencies).toEqual([{ predecessorEventId: 2, minGapDays: 3, maxGapDays: null }])
  })
  it('keeps events incomplete when the required discipline teacher is missing', async () => {
    const result = await createEvents(1, { eventTypeId: 1, expectedVersion: 1, studyGroupIds: [1], studentIds: [], disciplineId: 999 })
    expect(result.events[0].complete).toBe(false)
    expect(result.issues[0].code).toBe('MISSING_TEACHER')
  })
})

describe('HTTP contract', () => {
  beforeEach(() => vi.stubEnv('VITE_MOCK_API', 'false'))
  it('uses admin writes, catalog reads, and optimistic versions', async () => {
    const row = initialDatabase().groups[0]
    const request = vi.spyOn(http, 'request').mockResolvedValue({ data: row })
    const get = vi.spyOn(http, 'get').mockResolvedValue({ data: { items: [], totalPages: 0 } })
    await saveRecord('groups', { name: row.name, studentIds: [] }, row)
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/admin/groups/1', method: 'PUT', data: expect.objectContaining({ expectedVersion: 1 }) }))
    await listRecords('groups', 2, 'P3410')
    expect(get).toHaveBeenCalledWith('/university/groups', { params: { page: 2, size: 20, search: 'P3410' } })
  })
  it('omits the read-only slot size from rule updates', async () => {
    const put = vi.spyOn(http, 'put').mockResolvedValue({ data: defaultRules(2) })
    await saveRules(1, defaultRules())
    const body = put.mock.calls[0][1]
    expect(body).toHaveProperty('expectedVersion', 1)
    expect(body).not.toHaveProperty('slotMinutes')
    expect(body).not.toHaveProperty('inputVersion')
  })
  it('updates events using PUT and their own version', async () => {
    vi.stubEnv('VITE_MOCK_API', 'true')
    const event = (await createEvents(1, { eventTypeId: 4, expectedVersion: 1, studyGroupIds: [1], studentIds: [] })).events[0]
    vi.stubEnv('VITE_MOCK_API', 'false')
    const put = vi.spyOn(http, 'put').mockResolvedValue({ data: event })
    await updateEvent(event, { ...event, expectedVersion: event.version })
    expect(put).toHaveBeenCalledWith('/sessions/1/events/1', expect.objectContaining({ expectedVersion: 1 }))
  })
  it('strips read-only fields when a response object is reused as form defaults', async () => {
    const type = initialDatabase()['event-types'][4]
    const request = vi.spyOn(http, 'request').mockResolvedValue({ data: type })
    await saveRecord('event-types', type, type)
    const body = request.mock.calls[0][0]?.data
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('version')
    expect(body).toHaveProperty('expectedVersion', 1)
  })
  it('handles the password endpoint with no response body', async () => {
    vi.spyOn(http, 'put').mockResolvedValue({ data: undefined, status: 204 })
    expect(await accountAction(initialDatabase().accounts[0], 'password', 'test-password')).toHaveProperty('id', 1)
  })
})
