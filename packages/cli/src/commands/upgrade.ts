import { Command } from 'commander'
import { VERSION, log } from 'opendocuments-core'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createBackup, resolveDataDir } from './backup.js'

export function upgradeCommand() {
  return new Command('upgrade')
    .description('Back up the active instance and upgrade OpenDocuments')
    .option('--version <version>', 'Version or npm tag to install', 'latest')
    .option('--skip-backup', 'Skip the automatic pre-upgrade backup')
    .action(async (opts: { version: string; skipBackup?: boolean }) => {
      log.heading('Upgrading OpenDocuments')
      const target = opts.version.trim()
      if (!/^(?:latest|next|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.test(target)) {
        log.fail('Version must be a semantic version or the "latest"/"next" npm tag')
        process.exitCode = 1
        return
      }

      try {
        const dataDir = resolveDataDir()
        if (!opts.skipBackup && existsSync(join(dataDir, 'opendocuments.db'))) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
          const backupDir = join(homedir(), '.opendocuments', 'backups', `pre-upgrade-${timestamp}`)
          const result = createBackup(dataDir, backupDir)
          log.ok(`Pre-upgrade backup created at ${backupDir} (${result.copied} item(s))`)
        }

        execFileSync('npm', ['install', '-g', `opendocuments@${target}`], { stdio: 'inherit' })
        log.ok(`Upgrade to ${target} complete`)
        log.arrow('Run "opendocuments doctor" before restarting production traffic')
      } catch (error) {
        log.fail(`Upgrade failed: ${error instanceof Error ? error.message : String(error)}`)
        log.wait(`Attempting to restore CLI version ${VERSION}...`)
        try {
          execFileSync('npm', ['install', '-g', `opendocuments@${VERSION}`], { stdio: 'inherit' })
          log.ok(`CLI rolled back to ${VERSION}. Instance data was not changed.`)
        } catch (rollbackError) {
          log.fail(`Automatic CLI rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`)
        }
        process.exitCode = 1
      }
    })
}
