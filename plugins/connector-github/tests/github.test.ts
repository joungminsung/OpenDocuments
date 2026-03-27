import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GitHubConnector } from '../src/index.js'

describe('GitHubConnector', () => {
  let connector: GitHubConnector

  beforeEach(async () => {
    connector = new GitHubConnector()
    await connector.setup({
      config: { repo: 'owner/repo', token: 'fake-token', branch: 'main' },
      dataDir: '/tmp', log: console as any,
    })
  })

  it('has correct metadata', () => {
    expect(connector.name).toBe('@opendocs/connector-github')
    expect(connector.type).toBe('connector')
  })

  it('healthCheck succeeds when repo is accessible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    const status = await connector.healthCheck()
    expect(status.healthy).toBe(true)
    vi.unstubAllGlobals()
  })

  it('healthCheck fails when repo is not configured', async () => {
    const empty = new GitHubConnector()
    await empty.setup({ config: {}, dataDir: '/tmp', log: console as any })
    const status = await empty.healthCheck()
    expect(status.healthy).toBe(false)
  })

  it('discovers markdown files from repo tree', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tree: [
          { path: 'README.md', type: 'blob', sha: 'abc123' },
          { path: 'docs/guide.md', type: 'blob', sha: 'def456' },
          { path: 'src/index.ts', type: 'blob', sha: 'ghi789' },
          { path: 'docs', type: 'tree', sha: 'dir1' },
        ],
      }),
    }))

    const docs: any[] = []
    for await (const doc of connector.discover()) docs.push(doc)
    expect(docs).toHaveLength(3)  // .md and .ts files (expanded extension set)
    expect(docs[0].title).toBe('README.md')
    expect(docs[1].sourcePath).toContain('docs/guide.md')
    vi.unstubAllGlobals()
  })

  it('fetches file content with base64 decoding', async () => {
    const content = Buffer.from('# Hello World').toString('base64')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content, encoding: 'base64', name: 'README.md' }),
    }))

    const raw = await connector.fetch({ sourceId: 'abc', sourcePath: 'github://owner/repo/README.md' })
    expect(raw.content).toBe('# Hello World')
    expect(raw.title).toBe('README.md')
    vi.unstubAllGlobals()
  })

  it('includes auth header when token is set', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)

    await connector.healthCheck()
    const callArgs = mockFetch.mock.calls[0]
    expect(callArgs[1].headers.Authorization).toBe('Bearer fake-token')
    vi.unstubAllGlobals()
  })
})
