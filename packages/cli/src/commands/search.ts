import { Command } from 'commander'
import { log } from '@opendocs/core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function searchCommand() {
  return new Command('search')
    .description('Search indexed documents (no LLM generation)')
    .argument('<query>', 'Search query')
    .option('--top <n>', 'Number of results', '5')
    .option('--type <type>', 'Chunk type filter: semantic, code-ast, table')
    .action(async (query, opts) => {
      const ctx = await getContext()
      try {
        const embedder = ctx.registry.getModels().find(m => m.capabilities.embedding)
        if (!embedder?.embed) { log.fail('No embedding model configured'); return }

        const embedResult = await embedder.embed([query])
        const results = await ctx.store.searchChunks(embedResult.dense[0], parseInt(opts.top))

        if (results.length === 0) { log.info('No results found'); return }

        log.heading(`Search Results (${results.length})`)
        for (const [i, r] of results.entries()) {
          console.log(chalk.cyan(`  ${i + 1}.`), chalk.dim(`[${(r.score * 100).toFixed(0)}%]`), chalk.white(r.sourcePath))
          if (r.headingHierarchy.length > 0) {
            log.dim(`     ${r.headingHierarchy.join(' > ')}`)
          }
          log.dim(`     ${r.content.substring(0, 150).replace(/\n/g, ' ')}...`)
          log.blank()
        }
      } finally { await shutdownContext() }
    })
}
