import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GoogleModelPlugin } from '../src/index.js'

describe('GoogleModelPlugin', () => {
  let plugin: GoogleModelPlugin

  beforeEach(async () => {
    plugin = new GoogleModelPlugin()
    await plugin.setup({
      config: { apiKey: 'test-api-key' },
      dataDir: '/tmp',
      log: console as any,
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct metadata', () => {
    expect(plugin.name).toBe('@opendocuments/model-google')
    expect(plugin.type).toBe('model')
    expect(plugin.version).toBe('0.1.1')
    expect(plugin.capabilities.llm).toBe(true)
    expect(plugin.capabilities.embedding).toBe(true)
    expect(plugin.capabilities.reranker).toBe(false)
    expect(plugin.capabilities.vision).toBe(false)
  })

  it('healthCheck returns unhealthy when apiKey is not set', async () => {
    const noKeyPlugin = new GoogleModelPlugin()
    await noKeyPlugin.setup({
      config: {},
      dataDir: '/tmp',
      log: console as any,
    } as any)

    // Ensure GOOGLE_API_KEY is not set
    const origEnv = process.env.GOOGLE_API_KEY
    delete process.env.GOOGLE_API_KEY

    const status = await noKeyPlugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('GOOGLE_API_KEY not set')

    process.env.GOOGLE_API_KEY = origEnv
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
      expect.stringContaining('?key=test-api-key'),
      expect.objectContaining({}),
    )
  })

  it('healthCheck returns unhealthy on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('403')
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
          encoder.encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"world"}]}}]}\n\n',
          ),
        )
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

  it('generate includes systemInstruction when systemPrompt provided', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n',
          ),
        )
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
    expect(callBody.systemInstruction).toBeDefined()
    expect(callBody.systemInstruction.parts[0].text).toBe('You are helpful.')
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
    }).rejects.toThrow('Google AI error: 429')
  })

  it('embed returns dense vectors for each text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ embedding: { values: [0.4, 0.5, 0.6] } }),
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

    await expect(plugin.embed(['test'])).rejects.toThrow('Google embed error: 500')
  })
})
