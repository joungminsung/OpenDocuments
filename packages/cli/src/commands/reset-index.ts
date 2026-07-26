import { Command } from 'commander'
import { createSQLiteDB, log } from 'opendocuments-core'
import { existsSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createBackup, resolveDataDir } from './backup.js'

/**
 * Archive the incompatible vector index and reset document indexing metadata.
 * The source records remain so connectors and local indexing can rebuild them.
 */
export function prepareIndexReset(
  dataDir: string,
  backupRoot = join(homedir(), '.opendocuments', 'backups')
): { backupDir: string; archivedVectors?: string; documentsReset: number } {
  const databasePath = join(dataDir, 'opendocuments.db')
  if (!existsSync(databasePath)) {
    throw new Error(`Database not found in data directory: ${dataDir}`)
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = join(backupRoot, `pre-index-reset-${timestamp}`)
  createBackup(dataDir, backupDir)

  const vectorsDir = join(dataDir, 'vectors')
  const archivedVectors = existsSync(vectorsDir)
    ? join(dataDir, `vectors.pre-reset-${timestamp}`)
    : undefined
  if (archivedVectors) renameSync(vectorsDir, archivedVectors)

  let db: ReturnType<typeof createSQLiteDB> | undefined
  try {
    const openedDb = createSQLiteDB(databasePath)
    db = openedDb
    const count = openedDb.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM documents WHERE deleted_at IS NULL'
    )?.count ?? 0
    openedDb.transaction(() => {
      openedDb.run(
        `UPDATE documents
         SET chunk_count = 0, status = 'pending', error_message = NULL,
             content_hash = NULL, source_version = NULL, indexed_at = NULL, updated_at = ?
         WHERE deleted_at IS NULL`,
        [new Date().toISOString()]
      )
      openedDb.run('DELETE FROM chunks_fts')
    })
    return {
      backupDir,
      archivedVectors,
      documentsReset: count,
    }
  } catch (error) {
    if (archivedVectors && existsSync(archivedVectors) && !existsSync(vectorsDir)) {
      renameSync(archivedVectors, vectorsDir)
    }
    throw error
  } finally {
    db?.close()
  }
}

export function resetIndexCommand() {
  return new Command('reset-index')
    .description('Prepare a safe full reindex after changing embedding dimensions')
    .option('--yes', 'Confirm the reset')
    .action((opts: { yes?: boolean }) => {
      if (!opts.yes) {
        log.fail('This operation resets searchable chunks. Re-run with --yes after reviewing the backup plan.')
        process.exitCode = 1
        return
      }

      try {
        const dataDir = resolveDataDir()
        const result = prepareIndexReset(dataDir)
        log.ok(`Safety backup created at ${result.backupDir}`)
        if (result.archivedVectors) log.info(`Previous vector index archived at ${result.archivedVectors}`)
        log.ok(`${result.documentsReset} document record(s) marked for reindexing`)
        log.arrow('Restart OpenDocuments, sync each connector, and run "opendocuments index <path> --reindex" for local sources')
      } catch (error) {
        log.fail(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    })
}
