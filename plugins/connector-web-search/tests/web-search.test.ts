import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebSearchProvider } from '../src/index.js'

describe('WebSearchProvider', () => {
  let provider: WebSearchProvider

  beforeEach(async () => {
    provider = new WebSearchProvider()
    await provider.setup({
      config: { provider: 'tavily', apiKey: 'test-key' } as any,
      dataDir: '/tmp', log: console as any,
    })
  })

  it('has correct metadata', () => {
    expect(provider.name).toBe('@opendocs/connector-web-search')
  })

  it('healthCheck passes with API key', async () => {
    const status = await provider.healthCheck()
    expect(status.healthy).toBe(true)
  })

  it('healthCheck fails without API key', async () => {
    const empty = new WebSearchProvider()
    await empty.setup({ config: {} as any, dataDir: '/tmp', log: console as any })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
  })

  it('searches via Tavily API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1', score: 0.9 },
          { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2', score: 0.8 },
        ],
      }),
    }))

    const results = await provider.search('test query', 5)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Result 1')
    expect(results[0].score).toBe(0.9)
    vi.unstubAllGlobals()
  })
})
