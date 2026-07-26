let runtimeApiKey: string | null = null

export function getStoredApiKey(): string | null {
  return runtimeApiKey
}

export function setRuntimeApiKey(apiKey: string): void {
  runtimeApiKey = apiKey
}

export function clearRuntimeApiKey(): void {
  runtimeApiKey = null
}

export function withStoredApiKey(headers?: HeadersInit): HeadersInit {
  const apiKey = getStoredApiKey()
  const merged = new Headers(headers)
  if (apiKey) {
    merged.set('X-API-Key', apiKey)
  }
  return merged
}
