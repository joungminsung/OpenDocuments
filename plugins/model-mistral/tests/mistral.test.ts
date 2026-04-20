import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MistralModelPlugin } from '../src/index.js'

describe('MistralModelPlugin', () => {
  let plugin: MistralModelPlugin

  beforeEach(async () => {
    plugin = new MistralModelPlugin()
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
    expect(plugin.name).toBe('@opendocuments/model-mistral')
    expect(plugin.capabilities.llm).toBe(true)
    expect(plugin.capabilities.embedding).toBe(true)
    expect(plugin.capabilities.vision).toBe(true)
  })

  it('uses mistral-small-latest as default LLM', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close() },
      }),
    }))
    for await (const _ of plugin.generate('hi')) { /* drain */ }
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body)
    expect(body.model).toBe('mistral-small-latest')
  })

  it('embed uses mistral-embed by default and returns dense vectors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [0.1, 0.2] },
          { embedding: [0.3, 0.4] },
        ],
      }),
    }))
    const result = await plugin.embed(['a', 'b'])
    expect(result.dense).toEqual([[0.1, 0.2], [0.3, 0.4]])
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body)
    expect(body.model).toBe('mistral-embed')
  })

  it('healthCheck reports missing API key', async () => {
    const p = new MistralModelPlugin()
    const origEnv = process.env.MISTRAL_API_KEY
    delete process.env.MISTRAL_API_KEY
    await p.setup({ config: {}, dataDir: '/tmp', log: console as any } as any)
    const status = await p.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toBe('MISTRAL_API_KEY not set')
    if (origEnv !== undefined) process.env.MISTRAL_API_KEY = origEnv
  })
})
