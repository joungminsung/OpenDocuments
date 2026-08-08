import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
import type { PluginContext, ModelPlugin } from '../../src/plugin/interfaces.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Records which embedder was asked to embed, so routing is directly observable. */
function trackingEmbedder(name: string, log: string[]): ModelPlugin {
  return {
    name,
    type: 'model',
    version: '0.3.0',
    coreVersion: '^0.3.0',
    capabilities: { embedding: true },
    setup: vi.fn().mockResolvedValue(undefined),
    async embed(texts: string[]) {
      log.push(name)
      return { dense: texts.map(() => [0.1, 0.2, 0.3]) }
    },
  }
}

/**
 * `model.embeddingProvider` selects the embedder, and embedding dimensions are
 * resolved from that same setting. If ingest picks a different provider than
 * retrieval, documents are embedded at one width and queried at another. The
 * pipeline must therefore use the embedder it is handed, not whichever
 * embedding-capable plugin happens to have registered first.
 */
describe('IngestPipeline embedder routing', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string
  let store: DocumentStore
  let registry: PluginRegistry
  let eventBus: EventBus
  let middleware: MiddlewareRunner
  let ctx: PluginContext

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)

    registry = new PluginRegistry()
    eventBus = new EventBus()
    middleware = new MiddlewareRunner()
    ctx = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(new MarkdownParser(), ctx)

    store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  async function ingest(embedder?: ModelPlugin) {
    const pipeline = new IngestPipeline({
      store, registry, eventBus, middleware, embeddingDimensions: 3, embedder,
    })
    return pipeline.ingest({
      title: 'doc.md',
      content: '# Title\n\nSome indexed prose.',
      sourceType: 'local',
      sourcePath: '/doc.md',
      fileType: '.md',
    })
  }

  it('uses the supplied embedder over one already in the registry', async () => {
    // Mirrors bootstrap's registration order: the main provider registers first,
    // so a registry scan would pick it and ignore the configured override.
    const used: string[] = []
    await registry.register(trackingEmbedder('main-provider', used), ctx)

    const result = await ingest(trackingEmbedder('configured-embedder', used))

    expect(result.status).toBe('indexed')
    expect(used).toContain('configured-embedder')
    expect(used).not.toContain('main-provider')
  })

  it('falls back to the registry when no embedder is supplied', async () => {
    const used: string[] = []
    await registry.register(trackingEmbedder('main-provider', used), ctx)

    const result = await ingest()

    expect(result.status).toBe('indexed')
    expect(used).toContain('main-provider')
  })

  it('errors cleanly when neither a supplied nor a registered embedder exists', async () => {
    const result = await ingest()
    expect(result.status).toBe('error')
    expect(store.getDocument(result.documentId)?.error_message).toMatch(/No embedding model/)
  })
})
