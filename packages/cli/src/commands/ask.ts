import { Command } from 'commander'
import { log } from 'opendocuments-core'
import chalk from 'chalk'
import { getContext, shutdownContext } from '../utils/bootstrap.js'

export function askCommand() {
  return new Command('ask')
    .description('Ask a question about indexed documents')
    .argument('[query]', 'The question to ask')
    .option('--profile <profile>', 'RAG profile: fast, balanced, precise', 'balanced')
    .option('--json', 'Output as JSON')
    .option('--stdin', 'Read from stdin')
    .action(async (query, opts) => {
      // Check for piped stdin
      if (opts.stdin || !process.stdin.isTTY) {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of process.stdin) chunks.push(chunk)
          const stdinContent = Buffer.concat(chunks).toString('utf-8').trim()
          if (stdinContent) {
            query = query ? `${query}\n\nContext:\n${stdinContent}` : stdinContent
          }
        } catch {}
      }

      if (!query) {
        // Interactive REPL mode
        const ctx = await getContext()
        const readline = await import('node:readline')
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

        log.heading('OpenDocuments Interactive')
        log.dim(`Profile: ${opts.profile} | Type /quit to exit`)

        const askLine = () => {
          rl.question(chalk.green('\n  > '), async (input) => {
            const trimmed = input.trim()
            if (!trimmed || trimmed === '/quit' || trimmed === '/exit') {
              rl.close()
              await shutdownContext()
              return
            }
            if (trimmed.startsWith('/profile ')) {
              const p = trimmed.split(' ')[1]
              if (['fast', 'balanced', 'precise'].includes(p)) {
                opts.profile = p
                log.ok(`Profile: ${p}`)
              }
              askLine()
              return
            }

            // Stream answer
            for await (const event of ctx.ragEngine.queryStream({ query: trimmed, profile: opts.profile })) {
              if (event.type === 'chunk') process.stdout.write(event.data as string)
            }
            console.log()
            askLine()
          })
        }
        // Handle Ctrl+C gracefully in REPL
        rl.on('close', async () => {
          await shutdownContext()
          process.exit(0)
        })
        askLine()
        return // Don't shutdown -- REPL keeps running
      }

      const ctx = await getContext()
      try {
        if (opts.json) {
          const result = await ctx.ragEngine.query({ query, profile: opts.profile })
          console.log(JSON.stringify(result, null, 2))
        } else {
          log.heading('OpenDocuments')
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
