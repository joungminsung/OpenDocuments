import { describe, it, expect, vi, beforeEach } from 'vitest'
import { S3Connector } from '../src/index.js'

describe('S3Connector', () => {
  let connector: S3Connector

  beforeEach(async () => {
    connector = new S3Connector()
    await connector.setup({
      config: {
        provider: 's3',
        bucket: 'my-docs-bucket',
        prefix: 'docs/',
        region: 'us-east-1',
      },
      dataDir: '/tmp',
      log: console as any,
    })
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocuments/connector-s3')
    expect(connector.type).toBe('connector')
    expect(connector.version).toBe('0.1.1')
  })

  it('healthCheck succeeds when bucket is accessible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '<ListBucketResult></ListBucketResult>',
    }))

    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    expect(status.message).toContain('my-docs-bucket')
    vi.unstubAllGlobals()
  })

  it('discover lists supported objects from S3 bucket', async () => {
    const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>my-docs-bucket</Name>
  <Contents>
    <Key>docs/README.md</Key>
    <ETag>"abc123"</ETag>
  </Contents>
  <Contents>
    <Key>docs/guide.txt</Key>
    <ETag>"def456"</ETag>
  </Contents>
  <Contents>
    <Key>docs/image.png</Key>
    <ETag>"ghi789"</ETag>
  </Contents>
  <Contents>
    <Key>docs/setup.mdx</Key>
    <ETag>"jkl012"</ETag>
  </Contents>
</ListBucketResult>`

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => xmlResponse,
    }))

    const docs: any[] = []
    for await (const doc of connector.discover()) docs.push(doc)

    // image.png should be filtered out
    expect(docs).toHaveLength(3)
    expect(docs[0].sourceId).toBe('docs/README.md')
    expect(docs[0].title).toBe('README.md')
    expect(docs[0].sourcePath).toBe('s3://my-docs-bucket/docs/README.md')
    expect(docs[2].title).toBe('setup.mdx')
    vi.unstubAllGlobals()
  })

  it('fetch downloads object content from S3', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Documentation\n\nThis is the content.',
    }))

    const raw = await connector.fetch({
      sourceId: 'docs/README.md',
      sourcePath: 's3://my-docs-bucket/docs/README.md',
    })

    expect(raw.content).toBe('# Documentation\n\nThis is the content.')
    expect(raw.title).toBe('README.md')
    expect(raw.sourceId).toBe('docs/README.md')
    vi.unstubAllGlobals()
  })

  it('handles GCS provider with JSON list API', async () => {
    const gcsConnector = new S3Connector()
    await gcsConnector.setup({
      config: {
        provider: 'gcs',
        bucket: 'my-gcs-bucket',
        prefix: 'docs/',
      },
      dataDir: '/tmp',
      log: console as any,
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            name: 'docs/overview.md',
            id: 'my-gcs-bucket/docs/overview.md/1234',
            md5Hash: 'abc==',
            updated: '2024-01-01T00:00:00Z',
          },
          {
            name: 'docs/photo.jpg',
            id: 'my-gcs-bucket/docs/photo.jpg/5678',
            md5Hash: 'xyz==',
            updated: '2024-01-01T00:00:00Z',
          },
        ],
      }),
    }))

    const docs: any[] = []
    for await (const doc of gcsConnector.discover()) docs.push(doc)

    // photo.jpg should be filtered out
    expect(docs).toHaveLength(1)
    expect(docs[0].title).toBe('overview.md')
    expect(docs[0].sourcePath).toBe('gcs://my-gcs-bucket/docs/overview.md')
    expect(docs[0].contentHash).toBe('abc==')
    vi.unstubAllGlobals()
  })
})
