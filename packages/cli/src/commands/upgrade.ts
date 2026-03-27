import { Command } from 'commander'
import { log } from '@opendocuments/core'

export function upgradeCommand() {
  return new Command('upgrade').description('Upgrade OpenDocuments to latest version').action(async () => {
    const { execSync } = await import('node:child_process')
    log.heading('Upgrading OpenDocuments')
    try {
      execSync('npm install -g @opendocuments/cli@latest', { stdio: 'inherit' })
      log.ok('Upgrade complete')
    } catch (err) {
      log.fail('Upgrade failed. Try: npm install -g @opendocuments/cli@latest')
    }
  })
}
