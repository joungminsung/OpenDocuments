import { Command } from 'commander'
import { log } from 'opendocuments-core'
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

const DATA_DIR =
  process.env.OPENDOCUMENTS_DATA_DIR ?? join(homedir(), '.opendocuments')

/**
 * Recursively copies a directory from src to dest.
 */
function copyDirRecursive(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry)
    const destPath = join(dest, entry)
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

/** Files and directories to include in the backup. */
const BACKUP_FILES = [
  'opendocuments.db',
  'opendocuments.db-wal',
  'current-workspace',
] as const

const BACKUP_DIRS = ['vectors'] as const

export function backupCommand() {
  return new Command('backup')
    .description('Back up SQLite database and LanceDB vector data')
    .option(
      '-o, --output <path>',
      'Output directory for the backup',
      '',
    )
    .action(async (opts: { output: string }) => {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, 19)

      const backupDir =
        opts.output !== ''
          ? opts.output
          : join(homedir(), '.opendocuments', 'backups', `backup-${timestamp}`)

      log.heading('Backup')
      log.info(`Source : ${DATA_DIR}`)
      log.info(`Target : ${backupDir}`)
      log.blank()

      if (!existsSync(DATA_DIR)) {
        log.fail(`Data directory not found: ${DATA_DIR}`)
        process.exit(1)
      }

      mkdirSync(backupDir, { recursive: true })

      let copiedFiles = 0
      let skippedFiles = 0

      // Copy individual files
      for (const file of BACKUP_FILES) {
        const src = join(DATA_DIR, file)
        if (existsSync(src)) {
          log.wait(`Copying ${file}`)
          copyFileSync(src, join(backupDir, file))
          log.ok(`Copied ${file}`)
          copiedFiles++
        } else {
          log.dim(`Skipping ${file} (not found)`)
          skippedFiles++
        }
      }

      // Copy directories recursively
      for (const dir of BACKUP_DIRS) {
        const src = join(DATA_DIR, dir)
        if (existsSync(src)) {
          log.wait(`Copying ${dir}/`)
          copyDirRecursive(src, join(backupDir, dir))
          log.ok(`Copied ${dir}/`)
          copiedFiles++
        } else {
          log.dim(`Skipping ${dir}/ (not found)`)
          skippedFiles++
        }
      }

      log.blank()
      log.ok(`Backup complete — ${copiedFiles} item(s) copied, ${skippedFiles} skipped`)
      log.info(`Backup saved to ${backupDir}`)
    })
}

export function restoreCommand() {
  return new Command('restore')
    .description('Restore SQLite database and LanceDB vector data from a backup')
    .argument('<backup-path>', 'Path to the backup directory')
    .option('--force', 'Overwrite existing data without prompting')
    .action(async (backupPath: string, opts: { force: boolean }) => {
      log.heading('Restore')
      log.info(`Source : ${backupPath}`)
      log.info(`Target : ${DATA_DIR}`)
      log.blank()

      if (!existsSync(backupPath)) {
        log.fail(`Backup directory not found: ${backupPath}`)
        process.exit(1)
      }

      // Check whether any target files already exist
      const existingTargets: string[] = []
      for (const file of BACKUP_FILES) {
        if (existsSync(join(DATA_DIR, file))) {
          existingTargets.push(file)
        }
      }
      for (const dir of BACKUP_DIRS) {
        if (existsSync(join(DATA_DIR, dir))) {
          existingTargets.push(`${dir}/`)
        }
      }

      if (existingTargets.length > 0 && !opts.force) {
        log.fail('Existing data detected. Use --force to overwrite:')
        for (const t of existingTargets) {
          log.dim(`  ${t}`)
        }
        process.exit(1)
      }

      mkdirSync(DATA_DIR, { recursive: true })

      let restoredFiles = 0
      let skippedFiles = 0

      // Restore individual files
      for (const file of BACKUP_FILES) {
        const src = join(backupPath, file)
        if (existsSync(src)) {
          log.wait(`Restoring ${file}`)
          copyFileSync(src, join(DATA_DIR, file))
          log.ok(`Restored ${file}`)
          restoredFiles++
        } else {
          log.dim(`Skipping ${file} (not in backup)`)
          skippedFiles++
        }
      }

      // Restore directories recursively
      for (const dir of BACKUP_DIRS) {
        const src = join(backupPath, dir)
        if (existsSync(src)) {
          log.wait(`Restoring ${dir}/`)
          copyDirRecursive(src, join(DATA_DIR, dir))
          log.ok(`Restored ${dir}/`)
          restoredFiles++
        } else {
          log.dim(`Skipping ${dir}/ (not in backup)`)
          skippedFiles++
        }
      }

      log.blank()
      log.ok(`Restore complete — ${restoredFiles} item(s) restored, ${skippedFiles} skipped`)
      log.arrow('Restart the OpenDocuments server for changes to take effect')
    })
}
