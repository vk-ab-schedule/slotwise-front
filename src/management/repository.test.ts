import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authStore } from '../auth/authStore'
import { http } from '../api/http'
import { allRecords, listRecords, managementStorageKey, readDatabase, saveRecord } from './repository'
import { initialDatabase, defaultRules } from './demo'
import { accountAction, deleteUniversityRecord } from './university'
import { createEvents, listEvents, updateEvent } from './events'
import { deleteEventType } from './eventTypes'
import { getRules, saveRules } from './rules'
import { acceptSelectionSave, getSelections, saveSelection } from './sessions'

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
    expect((await listRecords('accounts', 0, 'Смирнов Александр')).items[0].id).toBe(1)
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
    const saved = await saveSelection(1, 'rooms', selections.rooms)
    expect(saved.sessionVersion).toBe(2)
    await expect(saveRules(1, defaultRules())).rejects.toThrow('Данные изменились')
    const rules = await getRules(1)
    expect((await saveRules(1, rules)).sessionVersion).toBe(3)
  })
  it('keeps an older rooms snapshot stale after saving a newer section', async () => {
    const before = await getSelections(1)
    const otherTab = await saveSelection(1, 'rooms', { ...before.rooms, roomIds: [2] })
    const fresh = await getSelections(1)
    expect(fresh.rooms.sessionVersion).toBe(otherTab.sessionVersion)
    expect(fresh.participants.sessionVersion).toBe(otherTab.sessionVersion)

    const mixed = { ...fresh, rooms: before.rooms }
    const saved = await saveSelection(1, 'participants', mixed.participants)
    const drafts = acceptSelectionSave(mixed, 'participants', saved, mixed.participants.sessionVersion)
    expect(drafts.commission.sessionVersion).toBe(saved.sessionVersion)
    await expect(saveSelection(1, 'rooms', drafts.rooms)).rejects.toThrow('Данные изменились')
    expect((await getSelections(1)).rooms.roomIds).toEqual([2])
    await expect(saveSelection(1, 'commission', drafts.commission)).resolves.toBeDefined()
  })
  it('copies templates into events and preserves them after template edits', async () => {
    const created = await createEvents(1, { eventTypeId: 4, expectedVersion: 1, studyGroupIds: [1], studentIds: [1] })
    expect(created.events).toHaveLength(1) // A group plus an explicit student does not duplicate the student.
    const template = readDatabase()['event-types'].find(t => t.id === 4)!
    await saveRecord('event-types', { ...template, defaultDurationMinutes: 60 }, template)
    expect((await listEvents(1))[0].durationMinutes).toBe(30)
    await expect(deleteEventType(readDatabase()['event-types'].find(t => t.id === 4)!)).rejects.toThrow('используется')
    const selections = await getSelections(1)
    await expect(saveSelection(1, 'participants', { ...selections.participants, studyGroupIds: [], accountIds: [] })).rejects.toThrow('используются в событиях')
  })
  it('keeps an event incomplete when a supervisor is missing', async () => {
    const db = initialDatabase(); db.supervisions = []; localStorage.setItem(managementStorageKey, JSON.stringify(db))
    const result = await createEvents(1, { eventTypeId: 5, expectedVersion: 1, studyGroupIds: [1], studentIds: [] })
    expect(result.events).toHaveLength(1)
    const [event] = result.events
    expect(event).toMatchObject({ complete: false, participants: [{ accountId: 1, role: 'STUDENT' }] })
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'MISSING_SUPERVISOR', severity: 'WARNING', accountIds: [1], eventIds: [event.id],
    })])
    expect(await listEvents(1)).toEqual([event])
    expect(readDatabase().sessions[0].version).toBe(2)
  })
  it.each([
    { name: 'disabled', enabled: false, role: 'TEACHER' },
    { name: 'no longer a teacher', enabled: true, role: 'ORGANIZER' },
  ] as const)('keeps the event incomplete when the linked supervisor is $name', async ({ enabled, role }) => {
    const db = initialDatabase()
    const link = db.supervisions[0]
    const supervisor = db.accounts.find(account => account.id === link.supervisorId)!
    supervisor.enabled = enabled
    supervisor.role = role
    localStorage.setItem(managementStorageKey, JSON.stringify(db))

    const result = await createEvents(1, { eventTypeId: 5, expectedVersion: 1, studyGroupIds: [1], studentIds: [] })
    expect(result.events).toHaveLength(1)
    const [event] = result.events
    expect(event).toMatchObject({ complete: false, participants: [{ accountId: link.studentId, role: 'STUDENT' }] })
    expect(result.issues).toEqual([expect.objectContaining({
      code: 'MISSING_SUPERVISOR', severity: 'WARNING', accountIds: [link.studentId], eventIds: [event.id],
    })])
    expect(readDatabase().supervisions).toContainEqual(link)
    expect(await listEvents(1)).toEqual([event])
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
  it('counts a teacher who also supervises the student once and keeps the event complete', async () => {
    const db = initialDatabase()
    const template = db['event-types'].find(t => t.id === 4)!
    template.participantRoles.push('DISCIPLINE_TEACHER')
    localStorage.setItem(managementStorageKey, JSON.stringify(db))
    const result = await createEvents(1, { eventTypeId: 4, expectedVersion: 1, studyGroupIds: [1], studentIds: [], disciplineId: 1 })
    const event = result.events[0]
    expect(event.participants).toEqual([{ accountId: 1, role: 'STUDENT' }, { accountId: 2, role: 'SUPERVISOR' }])
    expect(event.complete).toBe(true)
    await updateEvent(event, { ...event, expectedVersion: event.version, participants: [
      ...event.participants, { accountId: 2, role: 'DISCIPLINE_TEACHER' },
    ] })
    expect((await listEvents(1))[0]).toMatchObject({ participants: event.participants, complete: true })
  })
})

describe('HTTP contract', () => {
  beforeEach(() => vi.stubEnv('VITE_MOCK_API', 'false'))
  it('sends the version of the edited resource without substituting another version', async () => {
    const rooms = initialDatabase().selections[1].rooms
    const put = vi.spyOn(http, 'put').mockResolvedValue({ data: rooms })
    await saveSelection(1, 'rooms', { ...rooms, sessionVersion: 4 })
    expect(put).toHaveBeenCalledWith('/sessions/1/rooms', { roomIds: rooms.roomIds, expectedVersion: 4 })
  })
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
  it('returns an updated account after a password response with no body', async () => {
    const account = { ...initialDatabase().accounts[0], hasPassword: false }
    const put = vi.spyOn(http, 'put').mockResolvedValue({ data: undefined, status: 204 })
    const password = 'x'.repeat(8)
    expect(await accountAction(account, 'password', password)).toEqual({ ...account, hasPassword: true })
    expect(account.hasPassword).toBe(false)
    expect(put).toHaveBeenCalledWith('/admin/accounts/1/password', { expectedVersion: account.version, password })
  })
  it('rejects invalid passwords before sending a request and accepts 128 characters', async () => {
    const account = initialDatabase().accounts[0]
    const put = vi.spyOn(http, 'put').mockResolvedValue({ data: undefined, status: 204 })
    await expect(accountAction(account, 'password', 'x'.repeat(7))).rejects.toThrow('8')
    await expect(accountAction(account, 'password', ' '.repeat(8))).rejects.toThrow('непустой')
    await expect(accountAction(account, 'password', 'x'.repeat(129))).rejects.toThrow('128')
    expect(put).not.toHaveBeenCalled()
    await expect(accountAction(account, 'password', 'x'.repeat(128))).resolves.toHaveProperty('hasPassword', true)
  })
  it('keeps the account unchanged if setting the password fails', async () => {
    const account = { ...initialDatabase().accounts[0], hasPassword: false }
    const error = new Error('Password update failed')
    vi.spyOn(http, 'put').mockRejectedValue(error)
    await expect(accountAction(account, 'password', 'test-password')).rejects.toBe(error)
    expect(account.hasPassword).toBe(false)
  })
})
