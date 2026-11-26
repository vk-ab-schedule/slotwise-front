export function isMockMode() {
  return import.meta.env.VITE_MOCK_API !== 'false'
}
