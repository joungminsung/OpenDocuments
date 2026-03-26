import { Command } from 'commander'
import { log } from '@opendocs/core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function connectorCommand() {
  const cmd = new Command('connector')
    .description('Manage connectors')

  cmd.command('list')
    .description('List registered connectors')
    .action(async () => {
      const ctx = await getContext()
      try {
        const connectors = ctx.connectorManager.listConnectors()
        if (connectors.length === 0) {
          log.info('No connectors registered')
          return
        }
        log.heading('Connectors')
        for (const c of connectors) {
          const syncInfo = c.lastSyncedAt ? `last sync: ${c.lastSyncedAt}` : 'never synced'
          log.ok(`${c.name.padEnd(40)} ${chalk.dim(syncInfo)}`)
        }
      } finally {
        await shutdownContext()
      }
    })

  cmd.command('sync [name]')
    .description('Sync a connector (or all)')
    .action(async (name) => {
      const ctx = await getContext()
      try {
        if (name) {
          log.wait(`Syncing ${name}...`)
          const result = await ctx.connectorManager.syncConnector(name)
          log.ok(`Discovered: ${result.documentsDiscovered}, Indexed: ${result.documentsIndexed}, Skipped: ${result.documentsSkipped}`)
          if (result.errors.length > 0) {
            for (const err of result.errors) log.fail(err)
          }
        } else {
          log.wait('Syncing all connectors...')
          const results = await ctx.connectorManager.syncAll()
          for (const r of results) {
            log.ok(`${r.connectorName}: ${r.documentsIndexed} indexed, ${r.documentsSkipped} skipped`)
          }
        }
      } finally {
        await shutdownContext()
      }
    })

  return cmd
}
