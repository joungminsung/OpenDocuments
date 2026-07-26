import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ConnectorManager } from '../../src/connector/manager.js'
import { IngestPipeline } from '../../src/ingest/pipeline.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { EventBus } from '../../src/events/bus.js'
import { MiddlewareRunner } from '../../src/ingest/middleware.js'
import { MarkdownParser } from '../../src/parsers/markdown.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import type { ConnectorPlugin, ModelPlugin, PluginContext } from '../../src/plugin/interfaces.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function createMockEmbedder(): ModelPlugin {
  return {
    name: '@opendocuments/model-mock', type: 'model', version: '0.3.0', coreVersion: '^0.3.0',
    capabilities: { embedding: true },
    setup: async () => {},
    async embed(texts: string[]) {
      return { dense: texts.map(t => {
        const h = t.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
        return [Math.sin(h), Math.cos(h), Math.sin(h * 2)]
      })}
    },
  }
}

function createMockConnector(docs: { id: string; title: string; path: string; content: string }[]): ConnectorPlugin {
  return {
    name: '@opendocuments/connector-mock', type: 'connector', version: '0.3.0', coreVersion: '^0.3.0',
    setup: async () => {},
    async *discover() {
      for (const doc of docs) {
        yield { sourceId: doc.id, title: doc.title, sourcePath: doc.path }
      }
    },
    async fetch(ref) {
      const doc = docs.find(d => d.id === ref.sourceId)
      if (!doc) throw new Error('Not found')
      return { sourceId: doc.id, title: doc.title, content: doc.content }
    },
  }
}

describe('ConnectorManager', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string
  let manager: ConnectorManager

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)

    const registry = new PluginRegistry()
    const eventBus = new EventBus()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }

    await registry.register(createMockEmbedder(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")
    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const pipeline = new IngestPipeline({
      store, registry, eventBus, middleware: new MiddlewareRunner(), embeddingDimensions: 3,
    })

    manager = new ConnectorManager(pipeline, store, eventBus, db, 'ws-1')
  })

  afterEach(async () => {
    manager.stopAll()
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('registers a connector and creates DB record', () => {
    const connector = createMockConnector([])
    const id = manager.registerConnector(connector)
    expect(id).toBeDefined()

    const list = manager.listConnectors()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('@opendocuments/connector-mock')
  })

  it('stores connector config without reusable credentials and updates existing named connector', () => {
    const connector = createMockConnector([])
    const firstId = manager.registerConnector(connector, {
      name: 'github',
      config: {
        type: 'github',
        repo: 'owner/first',
        branch: 'main',
        token: 'secret-token',
        headers: { Authorization: 'Bearer secret-token' },
        nested: { client_secret: 'also-secret', folder: 'docs' },
      },
    })
    const secondId = manager.registerConnector(connector, {
      name: 'github',
      config: {
        type: 'github',
        repo: 'owner/second',
        branch: 'develop',
        token: 'secret-token',
        headers: { Authorization: 'Bearer secret-token' },
        nested: { client_secret: 'also-secret', folder: 'docs' },
      },
    })

    expect(secondId).toBe(firstId)

    const rows = db.all<any>('SELECT * FROM connectors WHERE name = ?', ['github'])
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0].config)).toMatchObject({
      type: 'github',
      repo: 'owner/second',
      branch: 'develop',
    })
    expect(JSON.parse(rows[0].config)).not.toHaveProperty('token')
    expect(JSON.parse(rows[0].config)).not.toHaveProperty('headers')
    expect(JSON.parse(rows[0].config)).toMatchObject({ nested: { folder: 'docs' } })
    expect(JSON.parse(rows[0].config).nested).not.toHaveProperty('client_secret')

    const list = manager.listConnectors()
    expect(list[0]).toMatchObject({
      name: 'github',
      type: '@opendocuments/connector-mock',
      repo: 'owner/second',
    })
  })

  it('starts periodic sync when registered with autoSync enabled', async () => {
    vi.useFakeTimers()
    try {
      const connector = createMockConnector([])
      const syncSpy = vi.spyOn(manager, 'syncConnector').mockResolvedValue({
        connectorName: '@opendocuments/connector-mock',
        documentsDiscovered: 0,
        documentsIndexed: 0,
        documentsSkipped: 0,
        errors: [],
      })

      manager.registerConnector(connector, {
        syncIntervalSeconds: 60,
        autoSync: true,
      })

      await vi.advanceTimersByTimeAsync(60000)
      expect(syncSpy).toHaveBeenCalledWith('@opendocuments/connector-mock')
    } finally {
      vi.useRealTimers()
    }
  })

  it('syncs a connector and indexes discovered documents', { timeout: 15000 }, async () => {
    const connector = createMockConnector([
      { id: '1', title: 'readme.md', path: '/repo/README.md', content: '# Hello\n\nWorld' },
      { id: '2', title: 'guide.md', path: '/repo/guide.md', content: '# Guide\n\nSetup instructions' },
    ])
    manager.registerConnector(connector)

    const result = await manager.syncConnector('@opendocuments/connector-mock')
    expect(result.documentsDiscovered).toBe(2)
    expect(result.documentsIndexed).toBe(2)
    expect(result.errors).toHaveLength(0)
  })

  it('marks a connector as failed when discovery fails', async () => {
    const connector: ConnectorPlugin = {
      ...createMockConnector([]),
      name: '@opendocuments/connector-failing',
      async *discover() {
        throw new Error('upstream unavailable')
      },
    }
    manager.registerConnector(connector, { name: 'failing' })

    const result = await manager.syncConnector('failing')
    const listed = manager.listConnectors().find((item) => item.name === 'failing')

    expect(result.errors).toContain('Discovery failed: upstream unavailable')
    expect(listed).toMatchObject({
      status: 'error',
      errorMessage: 'Discovery failed: upstream unavailable',
    })
  })

  it('coalesces overlapping sync requests for the same connector', async () => {
    let discoveries = 0
    const connector: ConnectorPlugin = {
      ...createMockConnector([]),
      name: '@opendocuments/connector-slow',
      async *discover() {
        discoveries++
        await new Promise((resolve) => setTimeout(resolve, 10))
      },
    }
    manager.registerConnector(connector, { name: 'slow' })

    const [first, second] = await Promise.all([
      manager.syncConnector('slow'),
      manager.syncConnector('slow'),
    ])

    expect(discoveries).toBe(1)
    expect(second).toBe(first)
  })

  it('skips unchanged documents on re-sync', async () => {
    const connector = createMockConnector([
      { id: '1', title: 'readme.md', path: '/repo/README.md', content: '# Hello\n\nWorld' },
    ])
    manager.registerConnector(connector)

    await manager.syncConnector('@opendocuments/connector-mock')
    const result2 = await manager.syncConnector('@opendocuments/connector-mock')
    expect(result2.documentsSkipped).toBe(1)
    expect(result2.documentsIndexed).toBe(0)
  })

  it('uses provider source versions to skip fetching unchanged documents', async () => {
    const fetch = vi.fn(async () => ({
      sourceId: '1',
      title: 'readme.md',
      content: '# Hello',
    }))
    const connector: ConnectorPlugin = {
      name: '@opendocuments/connector-versioned',
      type: 'connector',
      version: '0.3.0',
      coreVersion: '^0.3.0',
      setup: async () => {},
      async *discover() {
        yield {
          sourceId: '1',
          title: 'readme.md',
          sourcePath: '/repo/README.md',
          contentHash: 'provider-revision-1',
        }
      },
      fetch,
    }
    manager.registerConnector(connector, { name: 'versioned' })

    await manager.syncConnector('versioned')
    const second = await manager.syncConnector('versioned')

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(second.documentsSkipped).toBe(1)
  })

  it('records a new provider revision even when fetched content is unchanged', async () => {
    let revision = 'revision-1'
    const fetch = vi.fn(async () => ({
      sourceId: '1',
      title: 'readme.md',
      content: '# Same content',
    }))
    const connector: ConnectorPlugin = {
      name: '@opendocuments/connector-revision',
      type: 'connector',
      version: '0.3.0',
      coreVersion: '^0.3.0',
      setup: async () => {},
      async *discover() {
        yield { sourceId: '1', title: 'readme.md', sourcePath: '/same.md', contentHash: revision }
      },
      fetch,
    }
    manager.registerConnector(connector, { name: 'revision' })

    await manager.syncConnector('revision')
    revision = 'revision-2'
    await manager.syncConnector('revision')
    await manager.syncConnector('revision')

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('emits sync events', async () => {
    const events: string[] = []
    const eventBus = new EventBus()
    eventBus.onAny((event) => events.push(event))

    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(createMockEmbedder(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)
    const pipeline = new IngestPipeline({
      store, registry, eventBus, middleware: new MiddlewareRunner(), embeddingDimensions: 3,
    })

    const mgr = new ConnectorManager(pipeline, store, eventBus, db, 'ws-1')
    const connector = createMockConnector([
      { id: '1', title: 'test.md', path: '/test.md', content: '# Test' },
    ])
    mgr.registerConnector(connector)
    await mgr.syncConnector('@opendocuments/connector-mock')

    expect(events).toContain('connector:sync:started')
    expect(events).toContain('connector:sync:completed')
  })
})
