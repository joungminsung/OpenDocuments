import { Command } from 'commander'
import { log } from '@opendocuments/core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function documentCommand() {
  const cmd = new Command('document').description('Manage documents')

  cmd.command('list').description('List indexed documents').action(async () => {
    const ctx = await getContext()
    try {
      const docs = ctx.store.listDocuments()
      if (docs.length === 0) { log.info('No documents indexed'); return }
      log.heading('Documents')
      for (const d of docs) {
        const status = d.status === 'indexed' ? chalk.green('[ok]') : d.status === 'error' ? chalk.red('[!!]') : chalk.yellow('[..]')
        log.dim(`  ${status} ${(d.title || '').padEnd(30)} ${String(d.chunk_count || 0).padStart(4)} chunks  ${d.source_type}`)
      }
    } finally { await shutdownContext() }
  })

  cmd.command('get <id>').description('Get document details').action(async (id) => {
    const ctx = await getContext()
    try {
      const doc = ctx.store.getDocument(id)
      if (!doc) { log.fail('Document not found'); return }
      console.log(JSON.stringify(doc, null, 2))
    } finally { await shutdownContext() }
  })

  cmd.command('delete <id>').description('Delete a document (soft)').action(async (id) => {
    const ctx = await getContext()
    try {
      await ctx.store.softDeleteDocument(id)
      log.ok('Document moved to trash')
    } finally { await shutdownContext() }
  })

  cmd.command('restore <id>').description('Restore a deleted document').action(async (id) => {
    const ctx = await getContext()
    try {
      ctx.store.restoreDocument(id)
      log.ok('Document restored (needs re-indexing)')
    } finally { await shutdownContext() }
  })

  cmd.command('trash').description('List deleted documents').action(async () => {
    const ctx = await getContext()
    try {
      const docs = ctx.store.listDeletedDocuments()
      if (docs.length === 0) { log.info('Trash is empty'); return }
      log.heading('Trash')
      for (const d of docs) {
        log.dim(`  ${(d.title || '').padEnd(30)} deleted: ${d.deleted_at}`)
      }
    } finally { await shutdownContext() }
  })

  return cmd
}
