import { describe, it, expect, vi, afterEach } from 'vitest'
import { OpenAICompatibleModelPlugin } from '../src/index.js'

describe('OpenAICompatibleModelPlugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires baseUrl during setup', async () => {
    const p = new OpenAICompatibleModelPlugin()
    const origEnv = process.env.OPENAI_COMPATIBLE_BASE_URL
    delete process.env.OPENAI_COMPATIBLE_BASE_URL
    await expect(
      p.setup({ config: {}, dataDir: '/tmp', log: console as any } as any),
    ).rejects.toThrow(/baseUrl/)
    if (origEnv !== undefined) process.env.OPENAI_COMPATIBLE_BASE_URL = origEnv
  })

  it('sends requests to the configured baseUrl', async () => {
    const p = new OpenAICompatibleModelPlugin()
    await p.setup({
      config: {
        apiKey: 'sk-abc',
        baseUrl: 'https://example.com/v1',
        llmModel: 'llama-4-70b',
      },
      dataDir: '/tmp',
      log: console as any,
    } as any)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close() },
      }),
    }))
    for await (const _ of p.generate('hi')) { /* drain */ }

    const call = vi.mocked(fetch).mock.calls[0]
    expect(call[0]).toBe('https://example.com/v1/chat/completions')
    expect((call[1] as any).headers.Authorization).toBe('Bearer sk-abc')
  })

  it('merges extra headers into every request', async () => {
    const p = new OpenAICompatibleModelPlugin()
    await p.setup({
      config: {
        apiKey: 'k',
        baseUrl: 'https://openrouter.ai/api/v1',
        llmModel: 'x',
        extraHeaders: { 'HTTP-Referer': 'https://myapp.com' },
      },
      dataDir: '/tmp',
      log: console as any,
    } as any)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode('data: [DONE]\n\n')); c.close() },
      }),
    }))
    for await (const _ of p.generate('hi')) { /* drain */ }

    const headers = (vi.mocked(fetch).mock.calls[0][1] as any).headers
    expect(headers['HTTP-Referer']).toBe('https://myapp.com')
  })

  it('embed throws if embeddingModel not configured', async () => {
    const p = new OpenAICompatibleModelPlugin()
    await p.setup({
      config: { baseUrl: 'https://example.com/v1', apiKey: 'k' },
      dataDir: '/tmp',
      log: console as any,
    } as any)
    await expect(p.embed(['a'])).rejects.toThrow(/embeddingModel/)
  })

  it('disableEmbedding flag turns off embedding capability', async () => {
    const p = new OpenAICompatibleModelPlugin()
    await p.setup({
      config: {
        baseUrl: 'https://groq-like.example.com/v1',
        apiKey: 'k',
        llmModel: 'x',
        disableEmbedding: true,
      },
      dataDir: '/tmp',
      log: console as any,
    } as any)
    expect(p.capabilities.embedding).toBe(false)
  })
})
