import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IngestPipeline } from '../../src/ingest/pipeline.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { MarkdownParser } from '../../src/parsers/markdown.js'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { EventBus } from '../../src/events/bus.js'
import { MiddlewareRunner } from '../../src/ingest/middleware.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import type { ModelPlugin, PluginContext } from '../../src/plugin/interfaces.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function createMockModel(): ModelPlugin {
  return {
    name: '@opendocs/model-mock',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    setup: async () => {},
    async embed(texts: string[]) {
      return {
        dense: texts.map(t => {
          const hash = t.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
          return [Math.sin(hash), Math.cos(hash), Math.sin(hash * 2)]
        }),
      }
    },
  }
}

describe('IngestPipeline', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string
  let pipeline: IngestPipeline

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocs-test-'))
    vectorDb = await createLanceDB(tempDir)

    const registry = new PluginRegistry()
    const eventBus = new EventBus()
    const middleware = new MiddlewareRunner()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }

    await registry.register(createMockModel(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    pipeline = new IngestPipeline({ store, registry, eventBus, middleware, embeddingDimensions: 3 })
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('ingests a markdown document end-to-end', async () => {
    const result = await pipeline.ingest({
      title: 'test.md',
      content: '# Hello\n\nThis is a test document with some content.\n\n## Section 2\n\nMore content here.',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })
    expect(result.documentId).toBeDefined()
    expect(result.chunks).toBeGreaterThan(0)
    expect(result.status).toBe('indexed')
  })

  it('emits events during pipeline', async () => {
    const events: string[] = []
    const eventBus = new EventBus()
    eventBus.onAny((event) => events.push(event))

    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(createMockModel(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const p2 = new IngestPipeline({
      store, registry, eventBus, middleware: new MiddlewareRunner(), embeddingDimensions: 3,
    })

    await p2.ingest({
      title: 'test.md',
      content: '# Test\n\nHello world.',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })

    expect(events).toContain('document:parsed')
    expect(events).toContain('document:chunked')
    expect(events).toContain('document:embedded')
    expect(events).toContain('document:indexed')
  })

  it('skips unchanged documents via content hash', async () => {
    const content = '# Test\n\nHello world.'
    const first = await pipeline.ingest({
      title: 'test.md', content, sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    expect(first.status).toBe('indexed')

    const second = await pipeline.ingest({
      title: 'test.md', content, sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    expect(second.status).toBe('skipped')
  })
})
