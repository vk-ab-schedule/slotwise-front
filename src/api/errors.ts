import axios from 'axios'
import type { components } from './schema'

export function hasStatus(error: unknown, status: number) {
  return axios.isAxiosError(error) && error.response?.status === status
}

export function errorMessage(error: unknown, fallback = 'Не удалось выполнить запрос. Проверьте соединение и повторите.') {
  if (!axios.isAxiosError<components['schemas']['ApiProblem']>(error)) {
    return error instanceof Error ? error.message : fallback
  }
  const problem = error.response?.data
  if (error.response?.status === 409 && /STALE|VERSION|REVISION/i.test(problem?.code ?? '')) {
    return 'Данные изменились. Обновите страницу и повторите изменения.'
  }
  if (error.response?.status === 501) return 'Эта операция ещё не реализована на сервере. Попробуйте позже.'
  return [
    problem?.detail,
    ...(problem?.fieldErrors?.map(item => `${item.field}: ${item.message}`) ?? []),
    ...(problem?.issues?.map(issue => issue.message) ?? []),
  ].filter(Boolean).join('\n') || fallback
}
