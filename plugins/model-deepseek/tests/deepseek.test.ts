import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeepSeekModelPlugin } from '../src/index.js'

describe('DeepSeekModelPlugin', () => {
  let plugin: DeepSeekModelPlugin

  beforeEach(async () => {
    plugin = new DeepSeekModelPlugin()
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
    expect(plugin.name).toBe('@opendocuments/model-deepseek')
    expect(plugin.type).toBe('model')
    expect(plugin.capabilities.llm).toBe(true)
    expect(plugin.capabilities.embedding).toBe(false)
  })

  it('uses deepseek-chat as default model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
          },
        }),
      }),
    )
    for await (const _ of plugin.generate('hi')) { /* drain */ }
    const call = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse((call[1] as any).body)
    expect(body.model).toBe('deepseek-chat')
  })

  it('healthCheck reports missing API key', async () => {
    const p = new DeepSeekModelPlugin()
    const origEnv = process.env.DEEPSEEK_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    await p.setup({ config: {}, dataDir: '/tmp', log: console as any } as any)
    const status = await p.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toBe('DEEPSEEK_API_KEY not set')
    if (origEnv !== undefined) process.env.DEEPSEEK_API_KEY = origEnv
  })

  it('generate streams SSE chunks', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n'))
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"DeepSeek"}}]}\n\n'))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }))

    const tokens: string[] = []
    for await (const t of plugin.generate('hi')) tokens.push(t)
    expect(tokens).toEqual(['Hello ', 'DeepSeek'])
  })

  it('honors custom llmModel from config', async () => {
    const p = new DeepSeekModelPlugin()
    await p.setup({
      config: { apiKey: 'k', llmModel: 'deepseek-reasoner' },
      dataDir: '/tmp',
      log: console as any,
    } as any)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close() },
      }),
    }))
    for await (const _ of p.generate('q')) { /* drain */ }
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as any).body)
    expect(body.model).toBe('deepseek-reasoner')
  })
})
