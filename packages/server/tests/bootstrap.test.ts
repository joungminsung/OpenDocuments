import { describe, it, expect, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../src/bootstrap.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('bootstrap', () => {
  let tempDir: string
  let ctx: AppContext | null = null
  const stubModel = {
    provider: 'stub',
    llm: 'stub-llm',
    embedding: 'stub-embedding',
    apiKey: '',
    baseUrl: '',
    embeddingDimensions: 384,
  } as any

  afterEach(async () => {
    if (ctx) { await ctx.shutdown(); ctx = null }
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('initializes all core components with default config', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })
    expect(ctx.config).toBeDefined()
    expect(ctx.db).toBeDefined()
    expect(ctx.vectorDb).toBeDefined()
    expect(ctx.registry).toBeDefined()
    expect(ctx.eventBus).toBeDefined()
    expect(ctx.pipeline).toBeDefined()
    expect(ctx.ragEngine).toBeDefined()
    expect(ctx.workspaceManager).toBeDefined()
  })

  it('creates default workspace on bootstrap', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })
    const ws = ctx.workspaceManager.getByName('default')
    expect(ws).toBeDefined()
  })

  it('rejects unsupported relational database configuration', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    await expect(bootstrap({
      dataDir: tempDir,
      configOverrides: { model: stubModel, storage: { db: 'postgres' } },
    })).rejects.toThrow('Postgres storage is not implemented')
  })

  it('rejects unsupported vector database configuration', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    await expect(bootstrap({
      dataDir: tempDir,
      configOverrides: { model: stubModel, storage: { vectorDb: 'qdrant' } },
    })).rejects.toThrow('Qdrant storage is not implemented')
  })

  it('restores persisted GitHub connectors on bootstrap', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })
    const ws = ctx.workspaceManager.getByName('default')
    expect(ws).toBeDefined()
    ctx.db.run(
      `INSERT INTO connectors (id, workspace_id, name, type, config, sync_interval_seconds, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        'github-connector-1',
        ws!.id,
        'github',
        '@opendocuments/connector-github',
        JSON.stringify({ type: 'github', repo: 'owner/repo', branch: 'main' }),
        300,
        new Date().toISOString(),
      ]
    )
    await ctx.shutdown()
    ctx = null

    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })
    expect(ctx.connectorManager.listConnectors()).toEqual([
      expect.objectContaining({ name: 'github', repo: 'owner/repo' }),
    ])
  })
})
