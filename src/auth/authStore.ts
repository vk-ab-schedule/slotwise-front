import { makeAutoObservable, runInAction } from 'mobx'
import { api } from '../api/client'
import { errorMessage, hasStatus } from '../api/errors'
import { isMockMode } from '../api/mode'
import type { components } from '../api/schema'

export type User = components['schemas']['CurrentUserResponse']
export type Role = User['role']

const demoUsers: Record<Role, User> = {
  STUDENT: { id: 1, email: 'student@example.test', firstName: 'Александр', lastName: 'Смирнов', patronymic: null, role: 'STUDENT', timeZone: 'Europe/Moscow' },
  TEACHER: { id: 2, email: 'teacher@example.test', firstName: 'Мария', lastName: 'Петрова', patronymic: null, role: 'TEACHER', timeZone: 'Europe/Moscow' },
  ORGANIZER: { id: 3, email: 'organizer@example.test', firstName: 'Анна', lastName: 'Иванова', patronymic: null, role: 'ORGANIZER', timeZone: 'Europe/Moscow' },
  ADMIN: { id: 4, email: 'admin@example.test', firstName: 'Елена', lastName: 'Соколова', patronymic: null, role: 'ADMIN', timeZone: 'Europe/Moscow' },
}

export class AuthStore {
  user: User | null = null
  loading = true
  error = ''

  constructor() { makeAutoObservable(this) }

  get isAuthenticated() { return this.user !== null }

  async restore() {
    this.loading = true
    this.error = ''
    if (isMockMode()) {
      const saved = sessionStorage.getItem('slotwise-demo-role') as Role | null
      this.user = saved && demoUsers[saved] ? demoUsers[saved] : null
      this.loading = false
      return
    }
    try {
      const user = await api('get', '/api/auth/me', {})
      runInAction(() => { this.user = user })
    } catch (error) {
      runInAction(() => {
        this.user = null
        if (!hasStatus(error, 401)) this.error = errorMessage(error)
      })
    }
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
        await api('get', '/api/auth/me', {}).catch(error => {
          if (!hasStatus(error, 401)) throw error
        })
        const user = await api('post', '/api/auth/login', { body: { email, password } })
        runInAction(() => { this.user = user })
      }
      return true
    } catch (error) {
      const invalidCredentials = 'Проверьте введённые данные и попробуйте ещё раз'
      runInAction(() => { this.error = hasStatus(error, 401) ? invalidCredentials : errorMessage(error) })
      return false
    } finally { runInAction(() => { this.loading = false }) }
  }

  async logout() {
    this.error = ''
    try {
      if (isMockMode()) sessionStorage.removeItem('slotwise-demo-role')
      else await api('post', '/api/auth/logout', {})
      runInAction(() => { this.user = null })
    } catch (error) {
      runInAction(() => { this.error = errorMessage(error, 'Не удалось выйти из учётной записи.') })
    }
  }

  selectDemoRole(role: Role) {
    if (!isMockMode()) return
    sessionStorage.setItem('slotwise-demo-role', role)
    this.user = demoUsers[role]
  }
}

export const authStore = new AuthStore()
