import type { components } from './schema'

type ApiPage<T> = Omit<components['schemas']['PageResponsePlanningSessionResponse'], 'items'> & { items: T[] }

export type Page<T> = { items: T[]; page: number; size: number; totalElements: number; totalPages: number }

export function toPage<T>({ items, page, size, total }: ApiPage<T>): Page<T> {
  return { items, page, size, totalElements: total, totalPages: Math.ceil(total / size) }
}

export async function loadPages<T>(load: (page: number) => Promise<ApiPage<T>>): Promise<T[]> {
  const result: T[] = []
  let page = 0
  let totalPages = 1
  while (page < totalPages) {
    const data = toPage(await load(page))
    result.push(...data.items)
    totalPages = data.totalPages
    page++
  }
  return result
}
