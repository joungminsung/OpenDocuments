import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'

describe('FTS5 Porter stemming', () => {
  let db: DB

  beforeEach(() => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    db.run('INSERT INTO chunks_fts (chunk_id, content) VALUES (?, ?)', [
      'd1_chunk_0', 'the authentication service rotates keys automatically',
    ])
    db.run('INSERT INTO chunks_fts (chunk_id, content) VALUES (?, ?)', [
      'd1_chunk_1', 'debugging the retry logic for failed uploads',
    ])
  })

  afterEach(() => db.close())

  const hits = (term: string) =>
    db.all<{ chunk_id: string }>(
      'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ?', [`"${term}"`],
    )

  // Each of these scored zero under the original `unicode61` tokenizer, which
  // matched surface forms only. Because the lexical leg feeds retrieval rather
  // than just ordering, those misses dropped candidates entirely.
  it.each([
    ['authenticate', 'd1_chunk_0'],
    ['rotate', 'd1_chunk_0'],
    ['debug', 'd1_chunk_1'],
    ['fail', 'd1_chunk_1'],
    ['upload', 'd1_chunk_1'],
  ])('matches %s against its inflected form', (term, expected) => {
    expect(hits(term).map(r => r.chunk_id)).toContain(expected)
  })

  it('still matches exact surface forms', () => {
    expect(hits('authentication').map(r => r.chunk_id)).toContain('d1_chunk_0')
  })

  it('does not match unrelated terms', () => {
    expect(hits('quantum')).toHaveLength(0)
  })

  it('preserves rows written before the migration ran', () => {
    // Simulate a pre-migration index, then re-run migrations over it.
    const legacy = createSQLiteDB(':memory:')
    legacy.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT DEFAULT (datetime('now'))
      )
    `)
    legacy.exec(`CREATE VIRTUAL TABLE chunks_fts USING fts5(chunk_id, content, tokenize='unicode61')`)
    legacy.run('INSERT INTO chunks_fts (chunk_id, content) VALUES (?, ?)', [
      'legacy_chunk_0', 'the authentication service rotates keys',
    ])
    for (const name of [
      '001_initial.sql', '002_add_versioning_collections.sql', '003_add_source_path_index.sql',
      '004_add_api_keys.sql', '005_add_api_keys_revoked_at.sql', '006_add_fts5.sql',
      '007_add_api_key_allowed_ips.sql', '008_add_source_version.sql',
    ]) {
      legacy.run('INSERT INTO schema_migrations (name) VALUES (?)', [name])
    }

    runMigrations(legacy)

    const rows = legacy.all<{ chunk_id: string }>(
      'SELECT chunk_id FROM chunks_fts WHERE chunks_fts MATCH ?', ['"authenticate"'],
    )
    expect(rows.map(r => r.chunk_id)).toContain('legacy_chunk_0')
    legacy.close()
  })
})
