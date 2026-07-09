import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const stubModel = {
  provider: 'stub',
  llm: 'stub-llm',
  embedding: 'stub-embedding',
  apiKey: '',
  baseUrl: '',
  embeddingDimensions: 384,
} as any

describe('Admin Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })  // personal mode -- no auth needed
    app = createApp(ctx)
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('GET /api/v1/admin/stats returns indexing statistics', async () => {
    const res = await app.request('/api/v1/admin/stats')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toBeDefined()
    expect(body.chunks).toBeDefined()
    expect(body.sourceDistribution).toBeDefined()
  })

  it('GET /api/v1/admin/search-quality returns metrics', async () => {
    const res = await app.request('/api/v1/admin/search-quality')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalQueries).toBeDefined()
    expect(body.avgConfidence).toBeDefined()
  })

  it('GET /api/v1/admin/query-logs returns paginated logs', async () => {
    const res = await app.request('/api/v1/admin/query-logs?limit=10')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.logs).toBeDefined()
    expect(body.total).toBeDefined()
  })

  it('GET /api/v1/admin/plugins returns plugin health', async () => {
    const res = await app.request('/api/v1/admin/plugins')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plugins).toBeDefined()
    expect(body.plugins.length).toBeGreaterThan(0)
  })

  it('GET /api/v1/admin/connectors returns connector status', async () => {
    const res = await app.request('/api/v1/admin/connectors')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connectors).toBeDefined()
  })

  it('POST /api/v1/admin/connectors/github registers a GitHub connector', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/repos/owner/repo')) {
        return new Response(JSON.stringify({ full_name: 'owner/repo' }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }))

    const res = await app.request('/api/v1/admin/connectors/github', {
      method: 'POST',
      body: JSON.stringify({ repo: 'owner/repo', branch: 'main' }),
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.connector).toMatchObject({
      name: 'github',
      repo: 'owner/repo',
      status: 'active',
    })

    const list = await app.request('/api/v1/admin/connectors')
    const listBody = await list.json()
    expect(listBody.connectors).toEqual([
      expect.objectContaining({ name: 'github', repo: 'owner/repo' }),
    ])
  })

  it('POST /api/v1/admin/connectors/github starts automatic sync', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('/repos/owner/repo')) {
          return new Response(JSON.stringify({ full_name: 'owner/repo' }), { status: 200 })
        }
        if (url.includes('/git/trees/main?recursive=1')) {
          return new Response(JSON.stringify({ tree: [] }), { status: 200 })
        }
        return new Response('{}', { status: 404 })
      })
      vi.stubGlobal('fetch', fetchMock)

      const res = await app.request('/api/v1/admin/connectors/github', {
        method: 'POST',
        body: JSON.stringify({ repo: 'owner/repo', branch: 'main', syncInterval: 60 }),
        headers: { 'Content-Type': 'application/json' },
      })

      expect(res.status).toBe(201)
      await vi.advanceTimersByTimeAsync(60000)
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/repos/owner/repo/git/trees/main?recursive=1'),
        expect.any(Object),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('POST /api/v1/admin/connectors/github/sync indexes repository files', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/repos/owner/repo')) {
        return new Response(JSON.stringify({ full_name: 'owner/repo' }), { status: 200 })
      }
      if (url.includes('/git/trees/main?recursive=1')) {
        return new Response(JSON.stringify({
          tree: [{ path: 'README.md', type: 'blob', sha: 'sha-readme' }],
        }), { status: 200 })
      }
      if (url.includes('/contents/README.md?ref=main')) {
        return new Response(JSON.stringify({
          name: 'README.md',
          encoding: 'base64',
          content: Buffer.from('# Demo Repo\n\nGitHub connector content').toString('base64'),
        }), { status: 200 })
      }
      return new Response('{}', { status: 404 })
    }))

    await app.request('/api/v1/admin/connectors/github', {
      method: 'POST',
      body: JSON.stringify({ repo: 'owner/repo', branch: 'main' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const res = await app.request('/api/v1/admin/connectors/github/sync', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.documentsIndexed).toBe(1)
    expect(body.result.errors).toEqual([])

    const docs = ctx.store.listDocuments()
    expect(docs).toEqual([
      expect.objectContaining({
        title: 'README.md',
        source_type: '@opendocuments/connector-github',
        source_path: 'github://owner/repo/README.md',
        status: 'indexed',
      }),
    ])
  })
})

describe('Admin Routes (team mode)', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { mode: 'team', model: stubModel } })
    app = createApp(ctx)
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns 401 without API key', async () => {
    const res = await app.request('/api/v1/admin/stats')
    expect(res.status).toBe(401)
  })

  it('returns 403 with non-admin key', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'member-key',
      workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1',
      role: 'member',
    })
    const res = await app.request('/api/v1/admin/stats', {
      headers: { 'X-API-Key': rawKey },
    })
    expect(res.status).toBe(403)
  })

  it('returns 200 with admin key', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'admin-key',
      workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1',
      role: 'admin',
    })
    const res = await app.request('/api/v1/admin/stats', {
      headers: { 'X-API-Key': rawKey },
    })
    expect(res.status).toBe(200)
  })
})
