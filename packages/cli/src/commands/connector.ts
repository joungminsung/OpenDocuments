import { Command } from 'commander'
import { log } from '@opendocuments/core'
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

  cmd.command('add <type>').description('Add a connector (configures in opendocuments.config.ts)').action(async (type) => {
    log.info(`To add a ${type} connector, edit opendocuments.config.ts:`)
    log.arrow(`connectors: [{ type: '${type}', ... }]`)
  })

  cmd.command('status').description('Show connector sync status').action(async () => {
    const ctx = await getContext()
    try {
      const connectors = ctx.connectorManager.listConnectors()
      if (connectors.length === 0) { log.info('No connectors configured'); return }
      log.heading('Connector Status')
      for (const c of connectors) {
        const statusIcon = c.status === 'active' ? chalk.green('[ok]') : chalk.red('[!!]')
        log.dim(`  ${statusIcon} ${c.name.padEnd(30)} last sync: ${c.lastSyncedAt || 'never'}`)
      }
    } finally { await shutdownContext() }
  })

  cmd.command('remove <name>').description('Remove a connector').action(async (name) => {
    log.info(`To remove the ${name} connector, edit opendocuments.config.ts and remove it from the connectors array.`)
  })

  cmd.command('auth <name>').description('Re-authenticate a connector').action(async (name) => {
    log.info(`To update credentials for ${name}, edit opendocuments.config.ts or update environment variables.`)
  })

  return cmd
}
