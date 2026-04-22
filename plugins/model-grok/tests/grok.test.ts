import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GrokModelPlugin } from '../src/index.js'

describe('GrokModelPlugin', () => {
  let plugin: GrokModelPlugin

  beforeEach(async () => {
    plugin = new GrokModelPlugin()
    await plugin.setup({
      config: { apiKey: 'test-xai-key' },
      dataDir: '/tmp',
      log: console as any,
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct metadata', () => {
    expect(plugin.name).toBe('@opendocuments/model-grok')
    expect(plugin.type).toBe('model')
    expect(plugin.version).toBe('0.1.1')
    expect(plugin.capabilities.llm).toBe(true)
    expect(plugin.capabilities.embedding).toBe(true)
    expect(plugin.capabilities.reranker).toBe(false)
    expect(plugin.capabilities.vision).toBe(false)
  })

  it('healthCheck returns unhealthy when apiKey is not set', async () => {
    const noKeyPlugin = new GrokModelPlugin()
    await noKeyPlugin.setup({
      config: {},
      dataDir: '/tmp',
      log: console as any,
    } as any)

    const origEnv = process.env.XAI_API_KEY
    delete process.env.XAI_API_KEY

    const status = await noKeyPlugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('XAI_API_KEY not set')

    process.env.XAI_API_KEY = origEnv
  })

  it('healthCheck returns healthy when API is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true }),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toBe('Connected')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.x.ai/v1/models',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-xai-key' } }),
    )
  })

  it('healthCheck returns unhealthy on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('401')
  })

  it('healthCheck returns unhealthy on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('ECONNREFUSED')
  })

  it('generate yields streamed tokens from SSE', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'),
        )
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"world"}}]}\n\n'),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, body: stream }),
    )

    const tokens: string[] = []
    for await (const token of plugin.generate('test prompt')) {
      tokens.push(token)
    }
    expect(tokens).toEqual(['Hello ', 'world'])
  })

  it('generate includes system message when systemPrompt is provided', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, body: stream })
    vi.stubGlobal('fetch', mockFetch)

    const tokens: string[] = []
    for await (const token of plugin.generate('hello', { systemPrompt: 'You are helpful.' })) {
      tokens.push(token)
    }
    expect(tokens).toEqual(['Hi'])

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(callBody.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' })
    expect(callBody.messages[1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('generate throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, body: null }),
    )

    const gen = plugin.generate('test')
    await expect(async () => {
      for await (const _ of gen) {
        // consume
      }
    }).rejects.toThrow('Grok error: 429')
  })

  it('embed returns dense vectors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
        }),
      }),
    )

    const result = await plugin.embed(['hello', 'world'])
    expect(result.dense).toHaveLength(2)
    expect(result.dense[0]).toEqual([0.1, 0.2, 0.3])
    expect(result.dense[1]).toEqual([0.4, 0.5, 0.6])
  })

  it('embed throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    await expect(plugin.embed(['test'])).rejects.toThrow('Grok embed error: 500')
  })
})
