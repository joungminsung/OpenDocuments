import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GDriveConnector } from '../src/index.js'

describe('GDriveConnector', () => {
  let connector: GDriveConnector

  beforeEach(async () => {
    connector = new GDriveConnector()
    await connector.setup({
      config: { accessToken: 'fake-token', folderId: 'folder123' },
      dataDir: '/tmp',
      log: console as any,
    })
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-gdrive')
    expect(connector.type).toBe('connector')
    expect(connector.version).toBe('0.1.0')
  })

  it('healthCheck succeeds when access token is valid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [] }),
    }))
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toContain('Google Drive')
    vi.unstubAllGlobals()
  })

  it('healthCheck fails without access token', async () => {
    const empty = new GDriveConnector()
    await empty.setup({ config: {}, dataDir: '/tmp', log: console as any })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
    expect(status.message).toContain('No access token')
  })

  it('discover lists files from Google Drive folder', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        files: [
          {
            id: 'doc1',
            name: 'Design Spec.gdoc',
            mimeType: 'application/vnd.google-apps.document',
            modifiedTime: '2024-01-01T00:00:00Z',
            md5Checksum: 'abc123',
          },
          {
            id: 'txt1',
            name: 'notes.txt',
            mimeType: 'text/plain',
            modifiedTime: '2024-01-02T00:00:00Z',
            md5Checksum: 'def456',
          },
        ],
      }),
    }))

    const docs: any[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    expect(docs).toHaveLength(2)
    expect(docs[0].sourceId).toBe('doc1')
    expect(docs[0].title).toBe('Design Spec.gdoc')
    expect(docs[0].sourcePath).toBe('gdrive://doc1')
    expect(docs[1].contentHash).toBe('def456')
    vi.unstubAllGlobals()
  })

  it('fetch exports Google Doc content as plain text', async () => {
    const mockFetch = vi.fn()
      // First call: get file metadata
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'doc1',
          name: 'My Doc',
          mimeType: 'application/vnd.google-apps.document',
        }),
      })
      // Second call: export as plain text
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '# My Document\n\nHello world.',
      })

    vi.stubGlobal('fetch', mockFetch)

    const raw = await connector.fetch({ sourceId: 'doc1', sourcePath: 'gdrive://doc1' })
    expect(raw.content).toBe('# My Document\n\nHello world.')
    expect(raw.title).toBe('My Doc')
    expect(raw.sourceId).toBe('doc1')

    // Verify the export URL was called with mimeType=text/plain
    const exportCall = mockFetch.mock.calls[1]
    expect(exportCall[0]).toContain('/export')
    expect(exportCall[0]).toContain('text%2Fplain')

    vi.unstubAllGlobals()
  })
})
