import type { StreamEvent, SearchResult, ConfidenceResult } from './types'
import { withStoredApiKey } from './auth'

export interface SSECallbacks {
  onChunk: (text: string) => void
  onSources: (sources: SearchResult[]) => void
  onConfidence?: (confidence: ConfidenceResult) => void
  onDone: (data: { queryId: string; route: string; profile: string }) => void
  onError: (error: string) => void
}

export async function streamChat(
  query: string,
  profile: string | undefined,
  callbacks: SSECallbacks,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch('/api/v1/chat/stream', {
    method: 'POST',
    credentials: 'same-origin',
    headers: withStoredApiKey({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ query, profile }),
    signal,
  })

  if (!res.ok) {
    callbacks.onError(`HTTP ${res.status}`)
    return
  }

  if (!res.body) {
    callbacks.onError('No response body')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          try {
            const parsed = JSON.parse(data)
            switch (eventType) {
              case 'chunk':
                callbacks.onChunk(parsed as string)
                break
              case 'sources':
                callbacks.onSources(parsed as SearchResult[])
                break
              case 'confidence':
                callbacks.onConfidence?.(parsed as ConfidenceResult)
                break
              case 'done':
                callbacks.onDone(parsed)
                break
              case 'error':
                callbacks.onError(typeof parsed === 'object' && parsed.error ? parsed.error : 'Unknown streaming error')
                break
            }
          } catch (e) {
            console.warn('[SSE] Failed to parse data:', data?.substring(0, 100))
          }
          eventType = ''
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError((err as Error).message)
    }
  }
}
