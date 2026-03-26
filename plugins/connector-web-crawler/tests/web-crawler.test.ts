import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WebCrawlerConnector } from '../src/index.js'

describe('WebCrawlerConnector', () => {
  let connector: WebCrawlerConnector

  beforeEach(async () => {
    connector = new WebCrawlerConnector()
    await connector.setup({
      config: { urls: ['https://example.com/docs', 'https://example.com/api'] } as any,
      dataDir: '/tmp', log: console as any,
    })
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocs/connector-web-crawler')
    expect(connector.type).toBe('connector')
  })

  it('discovers URLs from config', async () => {
    const docs: any[] = []
    for await (const doc of connector.discover()) docs.push(doc)
    expect(docs).toHaveLength(2)
    expect(docs[0].sourcePath).toBe('https://example.com/docs')
  })

  it('fetches and extracts text from HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html><head><title>Test Page</title></head><body><h1>Hello</h1><p>World</p><script>evil()</script></body></html>',
    }))

    const raw = await connector.fetch({ sourceId: 'https://example.com', sourcePath: 'https://example.com' })
    expect(raw.title).toBe('Test Page')
    expect(raw.content).toContain('Hello')
    expect(raw.content).toContain('World')
    expect(raw.content).not.toContain('evil')
    vi.unstubAllGlobals()
  })

  it('healthCheck reports configured URLs', async () => {
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toContain('2')
  })
})
