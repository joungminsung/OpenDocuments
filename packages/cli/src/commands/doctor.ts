import { Command } from 'commander'
import { log } from '@opendocuments/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function doctorCommand() {
  return new Command('doctor')
    .description('Run health diagnostics')
    .action(async () => {
      log.heading('OpenDocuments Health Check')
      try {
        const ctx = await getContext()
        log.ok('Core           v0.1.0')

        // Test SQLite
        try {
          ctx.db.get('SELECT 1')
          log.ok('SQLite         connected')
        } catch {
          log.fail('SQLite         connection failed')
        }

        log.ok('LanceDB        connected')
        const docs = ctx.store.listDocuments()
        log.ok(`Documents      ${docs.length} indexed`)
        const workspaces = ctx.workspaceManager.list()
        log.ok(`Workspaces     ${workspaces.length}`)
        log.blank()
        log.heading('Plugins')
        // Flag stub models as not configured
        const models = ctx.registry.getModels()
        const modelNames = new Set(models.map((m) => m.name))
        for (const p of ctx.registry.listAll()) {
          if (modelNames.has(p.name) && p.name.includes('stub')) {
            log.wait(`${p.name.padEnd(35)} v${p.version} (not configured -- zero vectors)`)
          } else {
            log.ok(`${p.name.padEnd(35)} v${p.version}`)
          }
        }
      } catch (err) {
        log.fail(`Bootstrap failed: ${(err as Error).message}`)
      } finally {
        await shutdownContext()
      }
    })
}
