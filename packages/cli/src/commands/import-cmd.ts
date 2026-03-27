import { Command } from 'commander'
import { log } from '@opendocuments/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export function importCommand() {
  return new Command('import')
    .description('Import data from backup')
    .argument('<path>', 'Backup directory path')
    .action(async (backupDir) => {
      const ctx = await getContext()
      try {
        log.heading('Import')

        if (!existsSync(backupDir)) {
          log.fail(`Backup directory not found: ${backupDir}`)
          return
        }

        // Import conversations
        const convosPath = join(backupDir, 'conversations.json')
        if (existsSync(convosPath)) {
          const convos = JSON.parse(readFileSync(convosPath, 'utf-8'))
          let count = 0
          for (const convo of convos) {
            const created = ctx.conversationManager.create(convo.title)
            for (const msg of convo.messages || []) {
              ctx.conversationManager.addMessage(created.id, msg.role, msg.content)
            }
            count++
          }
          log.ok(`${count} conversations imported`)
        }

        log.ok('Import complete')
      } finally {
        await shutdownContext()
      }
    })
}
