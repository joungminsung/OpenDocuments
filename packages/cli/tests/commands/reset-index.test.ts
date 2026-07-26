import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSQLiteDB, runMigrations } from 'opendocuments-core'
import { prepareIndexReset } from '../../src/commands/reset-index.js'

describe('reset-index helper', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('backs up data, archives vectors, and marks documents for reindexing', () => {
    const root = mkdtempSync(join(tmpdir(), 'opendocuments-reset-index-'))
    tempDirs.push(root)
    const dataDir = join(root, 'data')
    const backupRoot = join(root, 'backups')
    mkdirSync(join(dataDir, 'vectors'), { recursive: true })
    writeFileSync(join(dataDir, 'vectors', 'index.bin'), 'vector-data')

    const db = createSQLiteDB(join(dataDir, 'opendocuments.db'))
    runMigrations(db)
    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")
    db.run(
      `INSERT INTO documents
       (id, workspace_id, title, source_type, source_path, chunk_count, status, content_hash)
       VALUES ('doc-1', 'ws-1', 'Guide', 'local', '/docs/guide.md', 2, 'indexed', 'hash')`
    )
    db.run("INSERT INTO chunks_fts (chunk_id, content) VALUES ('doc-1_chunk_0', 'guide')")
    db.close()

    const result = prepareIndexReset(dataDir, backupRoot)
    const reopened = createSQLiteDB(join(dataDir, 'opendocuments.db'))
    const document = reopened.get<{ status: string; chunk_count: number; content_hash: string | null }>(
      "SELECT status, chunk_count, content_hash FROM documents WHERE id = 'doc-1'"
    )
    const ftsCount = reopened.get<{ count: number }>('SELECT COUNT(*) as count FROM chunks_fts')?.count
    reopened.close()

    expect(result.documentsReset).toBe(1)
    expect(existsSync(join(result.backupDir, 'backup-manifest.json'))).toBe(true)
    expect(result.archivedVectors && existsSync(result.archivedVectors)).toBe(true)
    expect(existsSync(join(dataDir, 'vectors'))).toBe(false)
    expect(document).toEqual({ status: 'pending', chunk_count: 0, content_hash: null })
    expect(ftsCount).toBe(0)
    expect(readdirSync(backupRoot)).toHaveLength(1)
  })
})
