import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenDocumentsClient } from '../src/index.js'

describe('OpenDocumentsClient', () => {
  let client: OpenDocumentsClient

  beforeEach(() => {
    client = new OpenDocumentsClient({ baseUrl: 'http://localhost:3000', apiKey: 'test-key' })
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
      ok: true, json: async () => ({
        queryId: 'q1',
        answer: 'test',
        sources: [],
        confidence: { score: 0.8, level: 'high', reason: 'grounded' },
        route: 'rag',
        profile: 'balanced',
      }),
    }))
    const result = await client.ask('Hello', { profile: 'balanced' })
    expect(result.answer).toBe('test')
    expect(result.confidence.level).toBe('high')
    vi.unstubAllGlobals()
  })

  it('uploads documents with the server response shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ documentId: 'doc-1', chunks: 3, status: 'indexed' }),
    }))

    const result = await client.uploadDocument(new File(['hello'], 'hello.md'))

    expect(result.documentId).toBe('doc-1')
    expect(result.chunks).toBe(3)
    vi.unstubAllGlobals()
  })

  it('lists conversations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ conversations: [{ id: 'c1', title: 'Thread' }], limit: 50, offset: 0 }),
    }))

    const result = await client.listConversations()

    expect(result.conversations[0].id).toBe('c1')
    vi.unstubAllGlobals()
  })
})
