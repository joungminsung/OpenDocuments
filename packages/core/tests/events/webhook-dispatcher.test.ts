import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { EventBus } from '../../src/events/bus.js'
import { WebhookDispatcher } from '../../src/events/webhook-dispatcher.js'

// Helper: build a deterministic HMAC for a payload
function hmacSignature(secret: string, payload: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
}

describe('WebhookDispatcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ status: 200 })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends a POST request when a configured event is emitted', async () => {
    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://example.com/hook', events: ['document:indexed'] },
    ])

    bus.emit('document:indexed', { documentId: 'doc-1', chunks: 3 })

    // Give async dispatch a tick to complete
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://example.com/hook')
    expect(opts.method).toBe('POST')

    const body = JSON.parse(opts.body as string) as Record<string, unknown>
    expect(body.event).toBe('document:indexed')
    expect(body.data).toEqual({ documentId: 'doc-1', chunks: 3 })
    expect(typeof body.timestamp).toBe('string')

    dispatcher.destroy()
  })

  it('does not send requests for non-configured events', async () => {
    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://example.com/hook', events: ['document:indexed'] },
    ])

    bus.emit('query:received', { queryId: 'q-1', query: 'hello' })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchMock).not.toHaveBeenCalled()

    dispatcher.destroy()
  })

  it('stops sending after destroy() is called', async () => {
    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://example.com/hook', events: ['document:indexed'] },
    ])

    dispatcher.destroy()

    bus.emit('document:indexed', { documentId: 'doc-2', chunks: 1 })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds X-Webhook-Signature header when secret is configured', async () => {
    const secret = 'my-secret'
    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://example.com/hook', events: ['document:indexed'], secret },
    ])

    bus.emit('document:indexed', { documentId: 'doc-3', chunks: 2 })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = opts.headers as Record<string, string>

    // Reconstruct expected signature from the actual body sent
    const expectedSig = hmacSignature(secret, opts.body as string)
    expect(headers['X-Webhook-Signature']).toBe(expectedSig)

    dispatcher.destroy()
  })

  it('does not add signature header when no secret is set', async () => {
    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://example.com/hook', events: ['document:indexed'] },
    ])

    bus.emit('document:indexed', { documentId: 'doc-4', chunks: 1 })
    await new Promise(resolve => setTimeout(resolve, 0))

    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = opts.headers as Record<string, string>
    expect(headers['X-Webhook-Signature']).toBeUndefined()

    dispatcher.destroy()
  })

  it('retries on HTTP 500 responses up to configured limit', async () => {
    fetchMock
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValue({ status: 200 })

    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://example.com/hook', events: ['document:indexed'], retries: 3 },
    ])

    vi.useFakeTimers()

    bus.emit('document:indexed', { documentId: 'doc-5', chunks: 1 })

    // Flush the initial dispatch and each retry
    for (let i = 0; i < 5; i++) {
      await vi.runAllTimersAsync()
    }

    vi.useRealTimers()

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)

    dispatcher.destroy()
  })

  it('does not retry on 4xx responses', async () => {
    fetchMock.mockResolvedValue({ status: 404 })

    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://example.com/hook', events: ['document:indexed'], retries: 3 },
    ])

    bus.emit('document:indexed', { documentId: 'doc-6', chunks: 1 })
    await new Promise(resolve => setTimeout(resolve, 0))

    // Only one attempt — no retries
    expect(fetchMock).toHaveBeenCalledTimes(1)

    dispatcher.destroy()
  })

  it('dispatches to multiple webhooks when both are configured for the event', async () => {
    const bus = new EventBus()
    const dispatcher = new WebhookDispatcher(bus, [
      { url: 'https://a.example.com/hook', events: ['document:indexed'] },
      { url: 'https://b.example.com/hook', events: ['document:indexed'] },
    ])

    bus.emit('document:indexed', { documentId: 'doc-7', chunks: 4 })
    await new Promise(resolve => setTimeout(resolve, 0))

    const urls = fetchMock.mock.calls.map(([url]) => url as string)
    expect(urls).toContain('https://a.example.com/hook')
    expect(urls).toContain('https://b.example.com/hook')

    dispatcher.destroy()
  })
})
