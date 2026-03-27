import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('DocumentStore', () => {
  let db: DB
  let vectorDb: VectorDB
  let store: DocumentStore
  let tempDir: string

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)
    store = new DocumentStore(db, vectorDb, 'default-workspace-id')
    await store.initialize(3)
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a document record', () => {
    const doc = store.createDocument({
      title: 'test.md',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })
    expect(doc.id).toBeDefined()
    expect(doc.status).toBe('pending')
  })

  it('stores and retrieves chunks with vectors', async () => {
    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    await store.storeChunks(doc.id, [
      { content: 'Hello world', embedding: [1, 0, 0], chunkType: 'semantic', position: 0, tokenCount: 2, headingHierarchy: ['# Title'] },
      { content: 'Foo bar', embedding: [0, 1, 0], chunkType: 'semantic', position: 1, tokenCount: 2, headingHierarchy: ['# Title'] },
    ])
    const updated = store.getDocument(doc.id)
    expect(updated?.chunk_count).toBe(2)
    expect(updated?.status).toBe('indexed')
  })

  it('searches chunks by vector similarity', async () => {
    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    await store.storeChunks(doc.id, [
      { content: 'Hello', embedding: [1, 0, 0], chunkType: 'semantic', position: 0, tokenCount: 1, headingHierarchy: [] },
      { content: 'World', embedding: [0, 1, 0], chunkType: 'semantic', position: 1, tokenCount: 1, headingHierarchy: [] },
    ])
    const results = await store.searchChunks([1, 0, 0], 1)
    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('Hello')
  })

  it('soft deletes document and removes vectors', async () => {
    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    await store.storeChunks(doc.id, [
      { content: 'Hello', embedding: [1, 0, 0], chunkType: 'semantic', position: 0, tokenCount: 1, headingHierarchy: [] },
    ])
    await store.softDeleteDocument(doc.id)
    // Soft-deleted docs are filtered out by getDocument
    expect(store.getDocument(doc.id)).toBeUndefined()
    // Vectors are removed
    const results = await store.searchChunks([1, 0, 0], 10)
    expect(results).toHaveLength(0)
    // But document appears in deleted list
    const deleted = store.listDeletedDocuments()
    expect(deleted).toHaveLength(1)
    expect(deleted[0].id).toBe(doc.id)
  })

  it('restores a soft-deleted document', async () => {
    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    await store.softDeleteDocument(doc.id)
    expect(store.getDocument(doc.id)).toBeUndefined()
    store.restoreDocument(doc.id)
    const restored = store.getDocument(doc.id)
    expect(restored).toBeDefined()
    expect(restored?.status).toBe('pending')
  })

  it('hard deletes document and its chunks permanently', async () => {
    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    await store.storeChunks(doc.id, [
      { content: 'Hello', embedding: [1, 0, 0], chunkType: 'semantic', position: 0, tokenCount: 1, headingHierarchy: [] },
    ])
    await store.hardDeleteDocument(doc.id)
    expect(store.getDocument(doc.id)).toBeUndefined()
    const results = await store.searchChunks([1, 0, 0], 10)
    expect(results).toHaveLength(0)
    // Not in deleted list either (hard delete)
    const deleted = store.listDeletedDocuments()
    expect(deleted).toHaveLength(0)
  })

  it('checks content hash for change detection', () => {
    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    store.updateContentHash(doc.id, 'abc123')
    expect(store.hasContentChanged(doc.id, 'abc123')).toBe(false)
    expect(store.hasContentChanged(doc.id, 'xyz789')).toBe(true)
  })
})
