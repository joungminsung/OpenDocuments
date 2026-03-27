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
    name: '@opendocuments/model-mock', type: 'model', version: '0.1.0', coreVersion: '^0.1.0',
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
    name: '@opendocuments/connector-mock', type: 'connector', version: '0.1.0', coreVersion: '^0.1.0',
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

  it('syncs a connector and indexes discovered documents', async () => {
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
