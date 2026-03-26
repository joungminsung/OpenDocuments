import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotionConnector } from '../src/index.js'

describe('NotionConnector', () => {
  let connector: NotionConnector

  beforeEach(async () => {
    connector = new NotionConnector()
    await connector.setup({
      config: { token: 'fake-token' },
      dataDir: '/tmp', log: console as any,
    })
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocs/connector-notion')
    expect(connector.type).toBe('connector')
  })

  it('healthCheck succeeds when connected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    vi.unstubAllGlobals()
  })

  it('healthCheck fails without token', async () => {
    const empty = new NotionConnector()
    await empty.setup({ config: {}, dataDir: '/tmp', log: console as any })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('NOTION_TOKEN')
  })

  it('discovers pages via search API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 'page-1', object: 'page', properties: { Name: { type: 'title', title: [{ plain_text: 'Test Page' }] } }, last_edited_time: '2024-01-01' },
          { id: 'page-2', object: 'page', properties: {}, last_edited_time: '2024-01-02' },
        ],
        has_more: false,
      }),
    }))

    const docs: any[] = []
    for await (const doc of connector.discover()) docs.push(doc)
    expect(docs).toHaveLength(2)
    expect(docs[0].title).toBe('Test Page')
    expect(docs[0].sourcePath).toBe('notion://page-1')
    vi.unstubAllGlobals()
  })

  it('fetches page blocks and converts to text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { type: 'heading_1', heading_1: { rich_text: [{ plain_text: 'Title' }] } },
          { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Hello world' }] } },
          { type: 'code', code: { rich_text: [{ plain_text: 'const x = 1' }], language: 'javascript' } },
        ],
        has_more: false,
      }),
    }))

    const raw = await connector.fetch({ sourceId: 'page-1', sourcePath: 'notion://page-1' })
    expect(raw.content).toContain('# Title')
    expect(raw.content).toContain('Hello world')
    expect(raw.content).toContain('```javascript')
    vi.unstubAllGlobals()
  })
})
