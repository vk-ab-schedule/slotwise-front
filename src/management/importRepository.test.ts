import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importUniversity, parseImport } from './importRepository'
import { managementStorageKey, readDatabase } from './repository'
import { http } from '../api/http'

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) })
  vi.stubEnv('VITE_MOCK_API', 'true')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const document = {
  accounts: [{ externalId: 'import-student', firstName: 'Иван', lastName: 'Тестов', email: 'import@example.test', role: 'STUDENT', timeZone: 'Europe/Moscow', passwordHash: '{bcrypt}private-hash' }],
  groups: [{ externalId: 'import-group', name: 'P1111', students: ['import-student'] }],
  rooms: [{ externalId: 'import-room', name: '101', capacity: 20, equipment: ['Экран'] }],
  timetable: [{ account: 'import-student', room: 'import-room', start: '2026-06-15T09:00:00Z', end: '2026-06-15T10:00:00Z' }],
}
describe('university JSON import', () => {
  it.each(['{', '[]', '{"unknown":[]}', '{"accounts":{}}', '{"groups":[null]}'])('rejects malformed structure %s', text => {
    expect(() => parseImport(text)).toThrow()
  })
  it('does not mutate storage during preview and resolves references within the file', async () => {
    const result = await importUniversity(parseImport(JSON.stringify(document)), true)
    expect(result.summary).toMatchObject({ total: 4, created: 4, rejected: 0 })
    expect(result.applied).toBe(false)
    expect(localStorage.getItem(managementStorageKey)).toBeNull()
  })
  it('applies idempotently without persisting credentials', async () => {
    const input = parseImport(JSON.stringify(document))
    expect((await importUniversity(input, false)).applied).toBe(true)
    expect((await importUniversity(input, false)).summary).toMatchObject({ created: 0, updated: 0, unchanged: 4 })
    expect(readDatabase().groups.find(g => g.externalId === 'import-group')?.studentIds).toHaveLength(1)
    expect(localStorage.getItem(managementStorageKey)).not.toContain('private-hash')
  })
  it('requires explicit partial import and reports dependent invalid records', async () => {
    const input = parseImport(JSON.stringify({ ...document, groups: [{ externalId: 'bad-group', students: ['missing'] }] }))
    const rejected = await importUniversity(input, false)
    expect(rejected.applied).toBe(false)
    expect(rejected.diagnostics[0].path).toBe('groups[0]')
    expect(localStorage.getItem(managementStorageKey)).toBeNull()
    const partial = await importUniversity(input, false, true)
    expect(partial.applied).toBe(true)
    expect(partial.summary.rejected).toBe(1)
    expect(readDatabase().groups.some(g => g.externalId === 'bad-group')).toBe(false)
    expect(readDatabase().accounts.some(a => a.externalId === 'import-student')).toBe(true)
  })
  it('does not leak a bad password hash in diagnostics', async () => {
    const input = parseImport(JSON.stringify({ accounts: [{ ...document.accounts[0], email: 'bad-email' }] }))
    expect(JSON.stringify(await importUniversity(input, true))).not.toContain('private-hash')
  })
  it('sends the immutable preview input as JSON with explicit flags', async () => {
    vi.stubEnv('VITE_MOCK_API', 'false')
    const post = vi.spyOn(http, 'post').mockResolvedValue({ data: {} })
    const input = parseImport(JSON.stringify(document))
    await importUniversity(input, true)
    expect(post).toHaveBeenCalledWith('/admin/import', input, { params: { dryRun: true, allowPartial: false } })
  })
})
