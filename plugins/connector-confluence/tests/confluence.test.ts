import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfluenceConnector } from '../src/index.js'

vi.mock('@opendocuments/core', async () => {
  const actual = await vi.importActual('@opendocuments/core')
  return { ...actual, fetchWithTimeout: vi.fn() }
})

import { fetchWithTimeout } from '@opendocuments/core'

describe('ConfluenceConnector', () => {
  let connector: ConfluenceConnector

  beforeEach(async () => {
    connector = new ConfluenceConnector()
    await connector.setup({
      config: { baseUrl: 'https://test.atlassian.net/wiki', token: 'tok', email: 'user@test.com', spaceKey: 'DEV' } as any,
      dataDir: '/tmp', log: console as any,
    })
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-confluence')
    expect(connector.type).toBe('connector')
  })

  it('healthCheck succeeds', async () => {
    ;(fetchWithTimeout as any).mockResolvedValue({ ok: true })
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
  })

  it('healthCheck fails without config', async () => {
    const empty = new ConfluenceConnector()
    await empty.setup({ config: {} as any, dataDir: '/tmp', log: console as any })
    expect((await empty.healthCheck()).healthy).toBe(false)
  })

  it('discovers pages', async () => {
    ;(fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: '123', title: 'Page 1', version: { number: 5 } },
          { id: '456', title: 'Page 2', version: { number: 3 } },
        ],
        size: 2,
      }),
    })
    const docs: any[] = []
    for await (const doc of connector.discover()) docs.push(doc)
    expect(docs).toHaveLength(2)
    expect(docs[0].title).toBe('Page 1')
  })

  it('fetches page content', async () => {
    ;(fetchWithTimeout as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Test Page',
        body: { storage: { value: '<p>Hello <strong>world</strong></p>' } },
      }),
    })
    const raw = await connector.fetch({ sourceId: '123', sourcePath: 'confluence://123' })
    expect(raw.content).toContain('Hello')
    expect(raw.content).toContain('world')
    expect(raw.content).not.toContain('<p>')
  })
})
