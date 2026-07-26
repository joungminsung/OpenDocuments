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

  it('creates and activates the configured workspace on bootstrap', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({
      dataDir: tempDir,
      configOverrides: { workspace: 'configured-team', mode: 'team', model: stubModel },
    })
    const workspace = ctx.workspaceManager.getByName('configured-team')
    expect(workspace).toBeDefined()
    expect(workspace?.mode).toBe('team')
    expect(ctx.store.listDocuments()).toEqual([])
  })

  it('loads parser packages referenced by legacy plugin identifiers', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({
      dataDir: tempDir,
      projectDir: process.cwd(),
      configOverrides: {
        model: stubModel,
        plugins: ['@opendocuments/parser-pdf'],
      },
    })
    expect(ctx.registry.get('@opendocuments/parser-pdf')).toBeDefined()
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

  it('refuses to pretend application-level encryption is active', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    await expect(bootstrap({
      dataDir: tempDir,
      configOverrides: {
        model: stubModel,
        security: { storage: { encryptAtRest: true } },
      } as any,
    })).rejects.toThrow('application-level storage encryption is not implemented')
  })

  it('enforces the cloud processing data policy before loading a provider', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    await expect(bootstrap({
      dataDir: tempDir,
      configOverrides: {
        model: {
          provider: 'openai',
          llm: 'gpt-4o',
          embedding: 'text-embedding-3-small',
          embeddingDimensions: 1536,
        },
        security: { dataPolicy: { allowCloudProcessing: false } },
      } as any,
    })).rejects.toThrow('Cloud model processing is blocked')
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
