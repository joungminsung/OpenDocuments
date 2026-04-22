import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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
