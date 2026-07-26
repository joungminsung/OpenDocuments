import { Command } from 'commander'
import { log } from 'opendocuments-core'
import { resolve } from 'node:path'
import { resolveDataDir, restoreBackup } from './backup.js'

export function importCommand() {
  return new Command('import')
    .description('Import a complete OpenDocuments snapshot')
    .argument('<path>', 'Snapshot directory path')
    .option('--force', 'Replace existing data')
    .action(async (backupDir: string, opts: { force?: boolean }) => {
      log.heading('Import')
      try {
        const result = restoreBackup(resolveDataDir(), resolve(backupDir), opts.force === true)
        log.ok(`Import complete — ${result.restored} item(s) restored, ${result.skipped} skipped`)
      } catch (error) {
        log.fail(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    })
}
