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
    tempDir = mkdtempSync(join(tmpdir(), 'opendocs-test-'))
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
})
