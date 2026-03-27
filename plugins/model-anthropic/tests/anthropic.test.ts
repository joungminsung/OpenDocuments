import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AnthropicModelPlugin } from '../src/index.js'

describe('AnthropicModelPlugin', () => {
  let plugin: AnthropicModelPlugin

  beforeEach(() => {
    plugin = new AnthropicModelPlugin()
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
    expect(plugin.name).toBe('@opendocuments/model-anthropic')
    expect(plugin.type).toBe('model')
    expect(plugin.version).toBe('0.1.0')
    expect(plugin.capabilities.llm).toBe(true)
    expect(plugin.capabilities.embedding).toBe(false)
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
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )
  })

  it('healthCheck returns unhealthy when API key is missing', async () => {
    const noKeyPlugin = new AnthropicModelPlugin()
    await noKeyPlugin.setup({
      config: {},
      dataDir: '/tmp',
      log: console as any,
    } as any)

    const origEnv = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    const status = await noKeyPlugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toBe('ANTHROPIC_API_KEY not set')

    if (origEnv !== undefined) process.env.ANTHROPIC_API_KEY = origEnv
  })

  it('generate yields streamed tokens via SSE (content_block_delta)', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode(
            'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"world"}}\n\n',
          ),
        )
        controller.enqueue(
          encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'),
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

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('does not have an embed method', () => {
    expect((plugin as any).embed).toBeUndefined()
  })
})
