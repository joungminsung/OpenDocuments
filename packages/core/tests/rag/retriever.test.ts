import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Retriever } from '../../src/rag/retriever.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createMockEmbedder } from '../_fixtures/mock-models.js'

describe('Retriever', () => {
  let db: DB
  let vectorDb: VectorDB
  let store: DocumentStore
  let retriever: Retriever
  let tempDir: string

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocs-test-'))
    vectorDb = await createLanceDB(tempDir)
    store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const embedder = createMockEmbedder()
    retriever = new Retriever(store, embedder)

    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/test.md', fileType: '.md',
    })
    const embedResult = await embedder.embed!(['Redis configuration guide', 'Python tutorial basics', 'Database setup instructions'])
    await store.storeChunks(doc.id, [
      { content: 'Redis configuration guide', embedding: embedResult.dense[0], chunkType: 'semantic', position: 0, tokenCount: 3, headingHierarchy: ['# Redis'] },
      { content: 'Python tutorial basics', embedding: embedResult.dense[1], chunkType: 'semantic', position: 1, tokenCount: 3, headingHierarchy: ['# Python'] },
      { content: 'Database setup instructions', embedding: embedResult.dense[2], chunkType: 'semantic', position: 2, tokenCount: 3, headingHierarchy: ['# Database'] },
    ])
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('retrieves relevant chunks for a query', async () => {
    const results = await retriever.retrieve('Redis config', { k: 3, finalTopK: 2, minScore: 0 })
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('returns empty for unrelated query with high minScore', async () => {
    const results = await retriever.retrieve('quantum physics', { k: 3, finalTopK: 2, minScore: 0.99 })
    expect(results).toHaveLength(0)
  })

  it('uses hybrid search (dense + FTS5 sparse)', async () => {
    // FTS5 should find "Redis" by exact keyword match
    const results = await retriever.retrieve('Redis', { k: 3, finalTopK: 3, minScore: 0 })
    expect(results.length).toBeGreaterThan(0)
    // The Redis chunk should appear in results (boosted by both dense and sparse)
    const redisResult = results.find(r => r.content.includes('Redis'))
    expect(redisResult).toBeDefined()
  })

  it('FTS5 searchFTS returns results for keyword match', () => {
    const results = store.searchFTS('Redis', 5)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].content).toContain('Redis')
    expect(results[0].score).toBeGreaterThan(0)
    expect(results[0].score).toBeLessThanOrEqual(1)
  })

  it('FTS5 searchFTS returns empty for non-matching query', () => {
    const results = store.searchFTS('nonexistentterm12345', 5)
    expect(results).toHaveLength(0)
  })
})
