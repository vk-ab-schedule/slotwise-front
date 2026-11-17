import axios from 'axios'

export const http = axios.create({ baseURL: '/api', withCredentials: true, withXSRFToken: true })

export function isMockMode() {
  return import.meta.env.VITE_MOCK_API !== 'false'
}
