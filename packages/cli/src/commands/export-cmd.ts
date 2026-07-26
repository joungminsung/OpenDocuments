import { Command } from 'commander'
import { log } from 'opendocuments-core'
import { resolve } from 'node:path'
import { createBackup, resolveDataDir } from './backup.js'

export function exportCommand() {
  return new Command('export')
    .description('Export a restorable OpenDocuments data snapshot')
    .option('--output <path>', 'Output directory', './opendocuments-backup')
    .action(async (opts: { output: string }) => {
      const outDir = resolve(opts.output)
      log.heading('Export')
      try {
        const result = createBackup(resolveDataDir(), outDir)
        log.ok(`Export complete — ${result.copied} item(s) copied, ${result.skipped} skipped`)
        log.info(`Snapshot saved to ${outDir}`)
      } catch (error) {
        log.fail(error instanceof Error ? error.message : String(error))
        process.exitCode = 1
      }
    })
}
