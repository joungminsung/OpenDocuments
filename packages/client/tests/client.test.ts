import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenDocsClient } from '../src/index.js'

describe('OpenDocsClient', () => {
  let client: OpenDocsClient

  beforeEach(() => {
    client = new OpenDocsClient({ baseUrl: 'http://localhost:3000', apiKey: 'test-key' })
  })

  it('constructs with correct base URL', () => {
    expect(client).toBeDefined()
  })

  it('sends API key in headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', mockFetch)
    await client.getHealth()
    expect(mockFetch.mock.calls[0][1].headers['X-API-Key']).toBe('test-key')
    vi.unstubAllGlobals()
  })

  it('asks a question', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ queryId: 'q1', answer: 'test', sources: [], confidence: {}, route: 'rag', profile: 'balanced' }),
    }))
    const result = await client.ask('Hello')
    expect(result.answer).toBe('test')
    vi.unstubAllGlobals()
  })
})
