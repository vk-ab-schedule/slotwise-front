import { makeAutoObservable, runInAction } from 'mobx'
import { AxiosError } from 'axios'
import { http, isMockMode } from '../api/http'

import type { components } from '../api/schema'

type Schemas = components['schemas']
export type Role = Schemas['AccountRole']
export type User = Schemas['CurrentUserResponse']

const demoUsers: Record<Role, User> = {
  STUDENT: { id: 1, email: 'student@example.test', firstName: 'Александр', lastName: 'Смирнов', role: 'STUDENT', timeZone: 'Europe/Moscow', patronymic: null },
  TEACHER: { id: 2, email: 'teacher@example.test', firstName: 'Мария', lastName: 'Петрова', role: 'TEACHER', timeZone: 'Europe/Moscow', patronymic: null },
  ORGANIZER: { id: 3, email: 'organizer@example.test', firstName: 'Анна', lastName: 'Иванова', role: 'ORGANIZER', timeZone: 'Europe/Moscow', patronymic: null },
  ADMIN: { id: 4, email: 'admin@example.test', firstName: 'Елена', lastName: 'Соколова', role: 'ADMIN', timeZone: 'Europe/Moscow', patronymic: null },
}

export class AuthStore {
  user: User | null = null
  loading = true
  error = ''

  constructor() { makeAutoObservable(this) }

  get isAuthenticated() { return this.user !== null }

  async restore() {
    this.loading = true
    if (isMockMode()) {
      const saved = sessionStorage.getItem('slotwise-demo-role') as Role | null
      this.user = saved && demoUsers[saved] ? demoUsers[saved] : null
      this.loading = false
      return
    }
    try {
      const { data } = await http.get<User>('/auth/me')
      runInAction(() => { this.user = data })
    } catch { runInAction(() => { this.user = null }) }
    finally { runInAction(() => { this.loading = false }) }
  }

  async login(email: string, password: string) {
    this.error = ''
    this.loading = true
    try {
      if (isMockMode()) {
        const role = (Object.keys(demoUsers) as Role[]).find(key => demoUsers[key].email === email.trim().toLowerCase())
        if (!role || !password) throw new Error('Проверьте введённые данные и попробуйте ещё раз')
        sessionStorage.setItem('slotwise-demo-role', role)
        runInAction(() => { this.user = demoUsers[role] })
      } else {
        // A 401 still sets the XSRF-TOKEN cookie required by the login POST.
        await http.get('/auth/me').catch(() => undefined)
        const body: Schemas['LoginRequest'] = { email, password }
        const { data } = await http.post<User>('/auth/login', body)
        runInAction(() => { this.user = data })
      }
      return true
    } catch (error) {
      const detail = error instanceof AxiosError ? (error.response?.data as Partial<Schemas['ApiProblem']> | undefined)?.detail : undefined
      runInAction(() => { this.error = detail ?? 'Проверьте введённые данные и попробуйте ещё раз' })
      return false
    } finally { runInAction(() => { this.loading = false }) }
  }

  async logout() {
    if (isMockMode()) sessionStorage.removeItem('slotwise-demo-role')
    else await http.post('/auth/logout')
    runInAction(() => { this.user = null })
  }

  selectDemoRole(role: Role) {
    if (!isMockMode()) return
    sessionStorage.setItem('slotwise-demo-role', role)
    this.user = demoUsers[role]
  }
}

export const authStore = new AuthStore()
