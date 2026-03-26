import { Command } from 'commander'
import { log } from '@opendocs/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function doctorCommand() {
  return new Command('doctor')
    .description('Run health diagnostics')
    .action(async () => {
      log.heading('OpenDocs Health Check')
      try {
        const ctx = await getContext()
        log.ok('Core           v0.1.0')
        log.ok('SQLite         connected')
        log.ok('LanceDB        connected')
        const docs = ctx.store.listDocuments()
        log.ok(`Documents      ${docs.length} indexed`)
        const workspaces = ctx.workspaceManager.list()
        log.ok(`Workspaces     ${workspaces.length}`)
        log.blank()
        log.heading('Plugins')
        for (const p of ctx.registry.listAll()) {
          log.ok(`${p.name.padEnd(35)} v${p.version}`)
        }
      } catch (err) {
        log.fail(`Bootstrap failed: ${(err as Error).message}`)
      } finally {
        await shutdownContext()
      }
    })
}
