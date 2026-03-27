import { Command } from 'commander'
import { log } from '@opendocuments/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function exportCommand() {
  return new Command('export')
    .description('Export data for backup')
    .option('--output <path>', 'Output directory', './opendocuments-backup')
    .option('--workspace <name>', 'Workspace to export')
    .action(async (opts) => {
      const ctx = await getContext()
      try {
        log.heading('Export')
        const outDir = opts.output
        mkdirSync(outDir, { recursive: true })

        // Export documents metadata
        const docs = ctx.store.listDocuments()
        writeFileSync(join(outDir, 'documents.json'), JSON.stringify(docs, null, 2))
        log.ok(`${docs.length} documents exported`)

        // Export conversations
        const convos = ctx.conversationManager.list()
        const convoData = convos.map(c => ({
          ...c,
          messages: ctx.conversationManager.getMessages(c.id),
        }))
        writeFileSync(join(outDir, 'conversations.json'), JSON.stringify(convoData, null, 2))
        log.ok(`${convos.length} conversations exported`)

        // Export config
        writeFileSync(join(outDir, 'config.json'), JSON.stringify(ctx.config, null, 2))
        log.ok('Configuration exported')

        // Export workspaces
        const workspaces = ctx.workspaceManager.list()
        writeFileSync(join(outDir, 'workspaces.json'), JSON.stringify(workspaces, null, 2))
        log.ok(`${workspaces.length} workspaces exported`)

        log.blank()
        log.ok(`Backup saved to ${outDir}/`)
      } finally {
        await shutdownContext()
      }
    })
}
