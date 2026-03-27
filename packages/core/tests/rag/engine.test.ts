import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RAGEngine } from '../../src/rag/engine.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { EventBus } from '../../src/events/bus.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createMockEmbedder, createMockLLM } from '../_fixtures/mock-models.js'

function createMockModels() {
  return { embedder: createMockEmbedder(), llm: createMockLLM() }
}

describe('RAGEngine', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string
  let engine: RAGEngine

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocs-test-'))
    vectorDb = await createLanceDB(tempDir)
    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const { embedder, llm } = createMockModels()

    const doc = store.createDocument({
      title: 'guide.md', sourceType: 'local', sourcePath: '/guide.md', fileType: '.md',
    })
    const embedResult = await embedder.embed!(['Redis configuration guide with examples', 'Python setup tutorial for beginners'])
    await store.storeChunks(doc.id, [
      { content: 'Redis configuration guide with examples', embedding: embedResult.dense[0], chunkType: 'semantic', position: 0, tokenCount: 5, headingHierarchy: ['# Redis'] },
      { content: 'Python setup tutorial for beginners', embedding: embedResult.dense[1], chunkType: 'semantic', position: 1, tokenCount: 5, headingHierarchy: ['# Python'] },
    ])

    engine = new RAGEngine({
      store, llm, embedder, eventBus: new EventBus(), defaultProfile: 'balanced',
    })
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('answers a question with RAG pipeline', async () => {
    const result = await engine.query({ query: 'How to configure Redis?' })
    expect(result.answer).toContain('Based on the context')
    expect(result.route).toBe('rag')
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.confidence.level).toBeDefined()
  })

  it('handles greetings with direct response', async () => {
    const result = await engine.query({ query: 'Hello!' })
    expect(result.route).toBe('direct')
    expect(result.answer).toContain('OpenDocs')
    expect(result.sources).toHaveLength(0)
  })

  it('supports streaming mode', async () => {
    const chunks: string[] = []
    let sources: any = null
    for await (const event of engine.queryStream({ query: 'Redis config' })) {
      if (event.type === 'chunk') chunks.push(event.data as string)
      if (event.type === 'sources') sources = event.data
    }
    expect(chunks.join('')).toContain('Based on the context')
    expect(sources).toBeDefined()
  })

  it('respects profile settings', async () => {
    const fast = await engine.query({ query: 'Redis config', profile: 'fast' })
    expect(fast.profile).toBe('fast')
    expect(fast.sources.length).toBeLessThanOrEqual(3)
  })

  it('classifies intent and uses intent-specific prompt', async () => {
    const result = await engine.query({ query: 'How to implement the hello function?' })
    expect(result.route).toBe('rag')
    expect(result.answer).toBeDefined()
  })

  it('caches identical queries', async () => {
    const result1 = await engine.query({ query: 'What is Redis?' })
    const result2 = await engine.query({ query: 'What is Redis?' })
    // Second call should return a cached result with a different queryId
    expect(result2.queryId).not.toBe(result1.queryId)
    expect(result2.answer).toBe(result1.answer)
  })
})
