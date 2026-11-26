import axios from 'axios'
import type { paths } from './schema'

const http = axios.create({
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: 'application/json, application/problem+json' },
  timeout: 15_000,
})

type Path = keyof paths
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'
type Method<P extends Path> = {
  [M in HttpMethod]: [NonNullable<paths[P][M]>] extends [never] ? never : M
}[HttpMethod]
type Operation<P extends Path, M extends Method<P>> = NonNullable<paths[P][M]>
type ParametersOf<O> = O extends { parameters: infer T } ? T : never
type Parameter<O, K extends string> = K extends keyof ParametersOf<O> ? ParametersOf<O>[K] : never
type Input<T, Name extends string> = [NonNullable<T>] extends [never] ? { [N in Name]?: never }
  : undefined extends T ? { [N in Name]?: T } : { [N in Name]: T }
type JsonBody<O> = O extends { requestBody: { content: { 'application/json': infer T } } } ? T : never
type Request<O> = Input<Parameter<O, 'path'>, 'path'> & Input<Parameter<O, 'query'>, 'query'>
  & Input<JsonBody<O>, 'body'>

type Success = 200 | 201 | 202 | 204
type JsonResponse<R> = R extends { content: { 'application/json': infer T } } ? T : void
type Response<O> = O extends { responses: infer R } ? JsonResponse<R[Extract<keyof R, Success>]> : never

export async function api<P extends Path, M extends Method<P>>(
  method: M, path: P, request: Request<Operation<P, M>>,
): Promise<Response<Operation<P, M>>> {
  const { path: params, query, body } = request
  const url = path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = (params as Record<string, unknown> | undefined)?.[key]
    if (value == null) throw new Error(`Missing path parameter: ${key}`)
    return encodeURIComponent(String(value))
  })
  const response = await http.request<Response<Operation<P, M>>>({ method, url, params: query, data: body })
  if (response.status !== 204 && !String(response.headers['content-type']).includes('application/json')) {
    throw new Error('API вернул ответ в неожиданном формате. Проверьте адрес бэкенда и прокси.')
  }
  return response.data
}
