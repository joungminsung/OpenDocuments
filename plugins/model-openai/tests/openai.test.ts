import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenAIModelPlugin } from '../src/index.js'

describe('OpenAIModelPlugin', () => {
  let plugin: OpenAIModelPlugin

  beforeEach(() => {
    plugin = new OpenAIModelPlugin()
    plugin.setup({
      config: { apiKey: 'test-api-key' },
      dataDir: '/tmp',
      log: console as any,
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct metadata', () => {
    expect(plugin.name).toBe('@opendocs/model-openai')
    expect(plugin.type).toBe('model')
    expect(plugin.version).toBe('0.1.0')
    expect(plugin.capabilities.llm).toBe(true)
    expect(plugin.capabilities.embedding).toBe(true)
    expect(plugin.capabilities.reranker).toBe(false)
    expect(plugin.capabilities.vision).toBe(false)
  })

  it('healthCheck returns healthy when API is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      }),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toBe('Connected')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }),
      }),
    )
  })

  it('healthCheck returns unhealthy on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toBe('HTTP 401')
  })

  it('healthCheck returns unhealthy when API key is missing', async () => {
    const noKeyPlugin = new OpenAIModelPlugin()
    await noKeyPlugin.setup({
      config: {},
      dataDir: '/tmp',
      log: console as any,
    } as any)

    // Ensure env var is not set
    const origEnv = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY

    const status = await noKeyPlugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toBe('OPENAI_API_KEY not set')

    if (origEnv !== undefined) process.env.OPENAI_API_KEY = origEnv
  })

  it('embed returns dense vectors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] },
          ],
        }),
      }),
    )

    const result = await plugin.embed(['hello', 'world'])
    expect(result.dense).toHaveLength(2)
    expect(result.dense[0]).toEqual([0.1, 0.2, 0.3])
    expect(result.dense[1]).toEqual([0.4, 0.5, 0.6])

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('generate yields streamed tokens via SSE', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
          ),
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
})
