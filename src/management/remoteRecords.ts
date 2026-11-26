import { api } from '../api/client'
import { toPage, type Page } from '../api/page'
import type { Resource, ResourceMap, Schema, WriteMap } from './types'

type Query = { page: number; size: number; search?: string }
type Readers = { [R in Resource]: (query: Query) => Promise<Page<ResourceMap[R]>> }

export const readRecords: Readers = {
  accounts: async query => toPage(await api('get', '/api/admin/accounts', { query })),
  groups: async query => toPage(await api('get', '/api/university/groups', { query })),
  rooms: async query => toPage(await api('get', '/api/university/rooms', { query })),
  disciplines: async query => toPage(await api('get', '/api/university/disciplines', { query })),
  equipment: async query => toPage(await api('get', '/api/university/equipment', { query })),
  teachings: async query => toPage(await api('get', '/api/university/teachings', { query })),
  supervisions: async query => toPage(await api('get', '/api/university/supervisions', { query })),
  timetable: async query => toPage(await api('get', '/api/university/timetable', { query })),
  'event-types': async query => toPage(await api('get', '/api/event-types', { query })),
  sessions: async ({ page, size }) => toPage(await api('get', '/api/sessions', { query: { page, size } })),
}

type Writers = { [R in Resource]: (body: WriteMap[R], row?: ResourceMap[R]) => Promise<ResourceMap[R]> }

export const writeRecord: Writers = {
  accounts: (body, row) => {
    if (!row) return api('post', '/api/admin/accounts', { body })
    const { role, ...fields } = body
    void role
    return api('patch', '/api/admin/accounts/{id}', {
      path: { id: row.id }, body: { ...fields, expectedVersion: row.version },
    })
  },
  groups: (body, row) => row
    ? api('put', '/api/admin/groups/{id}', {
      path: { id: row.id }, body: { ...body, active: body.active ?? row.active, expectedVersion: row.version },
    })
    : api('post', '/api/admin/groups', { body }),
  rooms: (body, row) => row
    ? api('put', '/api/admin/rooms/{id}', {
      path: { id: row.id }, body: { ...body, active: body.active ?? row.active, expectedVersion: row.version },
    })
    : api('post', '/api/admin/rooms', { body }),
  disciplines: (body, row) => row
    ? api('put', '/api/admin/disciplines/{id}', {
      path: { id: row.id }, body: { ...body, active: body.active ?? row.active, expectedVersion: row.version },
    })
    : api('post', '/api/admin/disciplines', { body }),
  equipment: (body, row) => row
    ? api('put', '/api/admin/equipment/{id}', { path: { id: row.id }, body })
    : api('post', '/api/admin/equipment', { body }),
  teachings: body => api('post', '/api/admin/teachings', { body }),
  supervisions: body => api('post', '/api/admin/supervisions', { body }),
  timetable: (body, row) => row
    ? api('put', '/api/admin/timetable/{id}', { path: { id: row.id }, body })
    : api('post', '/api/admin/timetable', { body }),
  'event-types': (body, row) => row
    ? api('put', '/api/event-types/{id}', { path: { id: row.id }, body: { ...body, expectedVersion: row.version } })
    : api('post', '/api/event-types', { body }),
  sessions: (body, row) => row
    ? api('patch', '/api/sessions/{id}', { path: { id: row.id }, body: { ...body, expectedVersion: row.version } })
    : api('post', '/api/sessions', { body }),
}

type Deletable = Exclude<Resource, 'accounts' | 'sessions'>
type Deleters = { [R in Deletable]: (row: ResourceMap[R]) => Promise<void> }

export const deleteRecord: Deleters = {
  groups: ({ id, version }) => api('delete', '/api/admin/groups/{id}', { path: { id }, query: { expectedVersion: version } }),
  rooms: ({ id, version }) => api('delete', '/api/admin/rooms/{id}', { path: { id }, query: { expectedVersion: version } }),
  disciplines: ({ id, version }) => api('delete', '/api/admin/disciplines/{id}', { path: { id }, query: { expectedVersion: version } }),
  equipment: ({ id }) => api('delete', '/api/admin/equipment/{id}', { path: { id } }),
  teachings: ({ id }) => api('delete', '/api/admin/teachings/{id}', { path: { id } }),
  supervisions: ({ studentId, supervisorId }) => api('delete', '/api/admin/supervisions/{studentId}/{supervisorId}', { path: { studentId, supervisorId } }),
  timetable: ({ id }) => api('delete', '/api/admin/timetable/{id}', { path: { id } }),
  'event-types': ({ id, version }) => api('delete', '/api/event-types/{id}', { path: { id }, query: { expectedVersion: version } }),
}

export async function updateAccountAccess(account: Schema['AccountResponse'], action: 'role' | 'enabled' | 'password', value: string | boolean) {
  const path = { id: account.id }
  const expectedVersion = account.version
  if (action === 'password') {
    await api('put', '/api/admin/accounts/{id}/password', { path, body: { expectedVersion, password: String(value) } })
    return { ...account, hasPassword: true }
  }
  if (action === 'enabled') {
    return api('put', '/api/admin/accounts/{id}/enabled', { path, body: { expectedVersion, enabled: Boolean(value) } })
  }
  return api('put', '/api/admin/accounts/{id}/role', { path, body: { expectedVersion, role: value as Schema['AccountRole'] } })
}
