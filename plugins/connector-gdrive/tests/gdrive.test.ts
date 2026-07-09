import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
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
    expect(connector.version).toBe('0.1.1')
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

  it('exchanges a service account key for an access token during setup', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'service-token', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ files: [] }),
      })
    vi.stubGlobal('fetch', mockFetch)

    const serviceConnector = new GDriveConnector()
    await serviceConnector.setup({
      config: {
        serviceAccountKey: JSON.stringify({
          client_email: 'svc@example.iam.gserviceaccount.com',
          private_key: privateKeyPem,
          token_uri: 'https://oauth2.googleapis.com/token',
        }),
      },
      dataDir: '/tmp',
      log: console as any,
    })
    const status = await serviceConnector.healthCheck()

    expect(status.healthy).toBe(true)
    expect(mockFetch.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token')
    expect(mockFetch.mock.calls[0][1].method).toBe('POST')
    expect(String(mockFetch.mock.calls[0][1].body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer')
    expect(mockFetch.mock.calls[1][1].headers.Authorization).toBe('Bearer service-token')
    vi.unstubAllGlobals()
  })

  it('refreshes a service account token after an authenticated request returns 401', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'service-token-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'service-token-2', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const serviceConnector = new GDriveConnector()
    await serviceConnector.setup({
      config: {
        serviceAccountKey: {
          client_email: 'svc@example.iam.gserviceaccount.com',
          private_key: privateKeyPem,
        },
      },
      dataDir: '/tmp',
      log: console as any,
    })

    const status = await serviceConnector.healthCheck()

    expect(status.healthy).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(4)
    expect(mockFetch.mock.calls[3][1].headers.Authorization).toBe('Bearer service-token-2')
    vi.unstubAllGlobals()
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
