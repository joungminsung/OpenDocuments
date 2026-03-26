import { Command } from 'commander'
import { log } from '@opendocs/core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function askCommand() {
  return new Command('ask')
    .description('Ask a question about indexed documents')
    .argument('[query]', 'The question to ask')
    .option('--profile <profile>', 'RAG profile: fast, balanced, precise', 'balanced')
    .option('--json', 'Output as JSON')
    .action(async (query, opts) => {
      if (!query) {
        console.error(chalk.red('Usage: opendocs ask "your question"'))
        process.exit(1)
      }
      const ctx = await getContext()
      try {
        if (opts.json) {
          const result = await ctx.ragEngine.query({ query, profile: opts.profile })
          console.log(JSON.stringify(result, null, 2))
        } else {
          log.heading('OpenDocs')
          log.dim(`Profile: ${opts.profile}`)
          log.blank()
          console.log(chalk.green('  >'), chalk.white(query))
          log.blank()
          for await (const event of ctx.ragEngine.queryStream({ query, profile: opts.profile })) {
            if (event.type === 'chunk') {
              process.stdout.write(event.data as string)
            }
            if (event.type === 'sources' && Array.isArray(event.data) && (event.data as any[]).length > 0) {
              log.blank()
              log.dim('Sources:')
              for (const src of event.data as any[]) {
                log.dim(`  ${chalk.cyan(src.sourcePath)}`)
              }
            }
          }
          log.blank()
        }
      } finally {
        await shutdownContext()
      }
    })
}
