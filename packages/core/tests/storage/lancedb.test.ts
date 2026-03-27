import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createLanceDB } from '../../src/storage/lancedb.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('LanceDB VectorDB', () => {
  let vectorDb: VectorDB
  let tempDir: string
  const COLLECTION = 'test_chunks'

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)
    await vectorDb.ensureCollection(COLLECTION, 3)
  })

  afterEach(async () => {
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('upserts and counts documents', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello world', embedding: [1, 0, 0], metadata: { source: 'test' } },
      { id: 'chunk-2', content: 'foo bar', embedding: [0, 1, 0], metadata: { source: 'test' } },
    ])
    const count = await vectorDb.count(COLLECTION)
    expect(count).toBe(2)
  })

  it('searches by embedding similarity', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello world', embedding: [1, 0, 0], metadata: { source: 'a' } },
      { id: 'chunk-2', content: 'foo bar', embedding: [0, 1, 0], metadata: { source: 'b' } },
    ])
    const results = await vectorDb.search(COLLECTION, {
      embedding: [1, 0, 0],
      topK: 1,
    })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('chunk-1')
  })

  it('deletes documents', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello', embedding: [1, 0, 0], metadata: { source: 'test' } },
    ])
    await vectorDb.delete(COLLECTION, ['chunk-1'])
    const count = await vectorDb.count(COLLECTION)
    expect(count).toBe(0)
  })

  it('searches with filter on promoted metadata fields', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello', embedding: [1, 0, 0], metadata: { workspace_id: 'ws-1', document_id: 'doc-1' } },
      { id: 'chunk-2', content: 'world', embedding: [0.9, 0.1, 0], metadata: { workspace_id: 'ws-2', document_id: 'doc-2' } },
      { id: 'chunk-3', content: 'foo', embedding: [0.8, 0.2, 0], metadata: { workspace_id: 'ws-1', document_id: 'doc-3' } },
    ])

    // Filter to workspace_id = ws-1 only
    const results = await vectorDb.search(COLLECTION, {
      embedding: [1, 0, 0],
      topK: 10,
      filter: { workspace_id: 'ws-1' },
    })
    expect(results).toHaveLength(2)
    const ids = results.map(r => r.id).sort()
    expect(ids).toEqual(['chunk-1', 'chunk-3'])
  })

  it('deleteByFilter removes matching rows', async () => {
    await vectorDb.upsert(COLLECTION, [
      { id: 'chunk-1', content: 'hello', embedding: [1, 0, 0], metadata: { document_id: 'doc-A' } },
      { id: 'chunk-2', content: 'world', embedding: [0, 1, 0], metadata: { document_id: 'doc-A' } },
      { id: 'chunk-3', content: 'foo', embedding: [0, 0, 1], metadata: { document_id: 'doc-B' } },
    ])

    await vectorDb.deleteByFilter(COLLECTION, { document_id: 'doc-A' })
    const count = await vectorDb.count(COLLECTION)
    expect(count).toBe(1)

    const results = await vectorDb.search(COLLECTION, {
      embedding: [0, 0, 1],
      topK: 10,
    })
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('chunk-3')
  })

  it('reconstructs metadata from promoted fields and metadata_json', async () => {
    await vectorDb.upsert(COLLECTION, [
      {
        id: 'chunk-1',
        content: 'hello',
        embedding: [1, 0, 0],
        metadata: {
          workspace_id: 'ws-1',
          document_id: 'doc-1',
          chunk_type: 'semantic',
          position: 0,
          token_count: 5,
          heading_hierarchy: '["# Title"]',
          language: 'en',
        },
      },
    ])

    const results = await vectorDb.search(COLLECTION, {
      embedding: [1, 0, 0],
      topK: 1,
    })
    expect(results).toHaveLength(1)
    expect(results[0].metadata.workspace_id).toBe('ws-1')
    expect(results[0].metadata.document_id).toBe('doc-1')
    expect(results[0].metadata.chunk_type).toBe('semantic')
    expect(results[0].metadata.position).toBe(0)
    expect(results[0].metadata.token_count).toBe(5)
    expect(results[0].metadata.heading_hierarchy).toBe('["# Title"]')
    expect(results[0].metadata.language).toBe('en')
  })
})
