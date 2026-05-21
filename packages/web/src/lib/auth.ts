const API_KEY_STORAGE_KEY = 'opendocuments-api-key'

export function getStoredApiKey(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(API_KEY_STORAGE_KEY)
}

export function setStoredApiKey(apiKey: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey)
}

export function clearStoredApiKey(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(API_KEY_STORAGE_KEY)
}

export function withStoredApiKey(headers?: HeadersInit): HeadersInit {
  const apiKey = getStoredApiKey()
  const merged = new Headers(headers)
  if (apiKey) {
    merged.set('X-API-Key', apiKey)
  }
  return merged
}
