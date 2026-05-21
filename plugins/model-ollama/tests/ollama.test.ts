import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaModelPlugin } from '../src/index.js'

describe('OllamaModelPlugin', () => {
  let plugin: OllamaModelPlugin

  beforeEach(() => {
    plugin = new OllamaModelPlugin()
    plugin.setup({ config: {}, dataDir: '/tmp', log: console as any } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('has correct metadata', () => {
    expect(plugin.name).toBe('@opendocuments/model-ollama')
    expect(plugin.type).toBe('model')
    expect(plugin.version).toBe('0.1.3')
    expect(plugin.capabilities.llm).toBe(true)
    expect(plugin.capabilities.embedding).toBe(true)
    expect(plugin.capabilities.reranker).toBe(false)
    expect(plugin.capabilities.vision).toBe(false)
  })

  it('applies config from setup', async () => {
    const customPlugin = new OllamaModelPlugin()
    await customPlugin.setup({
      config: {
        baseUrl: 'http://remote:11434',
        llmModel: 'llama3',
        embeddingModel: 'nomic-embed',
      },
      dataDir: '/tmp',
      log: console as any,
    } as any)

    // Verify config was applied by checking healthCheck URL
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: [] }) }),
    )

    await customPlugin.healthCheck()
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('http://remote:11434/api/tags', expect.objectContaining({}))
  })

  it('healthCheck returns healthy when Ollama is reachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      }),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toContain('Connected')
  })

  it('healthCheck returns unhealthy on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('503')
  })

  it('healthCheck returns unhealthy when Ollama is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    )

    const status = await plugin.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('Cannot connect')
  })

  it('embed returns dense vectors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          embeddings: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
          ],
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

    await expect(plugin.embed(['test'])).rejects.toThrow('Ollama embed error: 500')
  })

  it('generate yields streamed tokens', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"response":"Hello "}\n'))
        controller.enqueue(encoder.encode('{"response":"world"}\n'))
        controller.enqueue(encoder.encode('{"response":"","done":true}\n'))
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

  it('generate uses chat endpoint when systemPrompt is provided', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"message":{"role":"assistant","content":"Hi"}}\n'))
        controller.enqueue(encoder.encode('{"message":{"role":"assistant","content":" there"},"done":true}\n'))
        controller.close()
      },
    })

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, body: stream })
    vi.stubGlobal('fetch', mockFetch)

    const tokens: string[] = []
    for await (const token of plugin.generate('hello', { systemPrompt: 'You are helpful.' })) {
      tokens.push(token)
    }
    expect(tokens).toEqual(['Hi', ' there'])

    // Verify it called the chat endpoint
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('generate throws on HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, body: null }),
    )

    const gen = plugin.generate('test')
    await expect(async () => {
      for await (const _ of gen) {
        // consume
      }
    }).rejects.toThrow('Ollama generate error: 500')
  })
})
