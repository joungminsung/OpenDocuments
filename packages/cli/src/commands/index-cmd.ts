import { Command } from 'commander'
import { log } from '@opendocs/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { readFileSync, statSync, readdirSync } from 'node:fs'
import { extname, join, basename, resolve } from 'node:path'

export function indexCommand() {
  return new Command('index')
    .description('Index a file or directory')
    .argument('<path>', 'File or directory path')
    .option('--reindex', 'Force reindex even if unchanged')
    .action(async (inputPath, _opts) => {
      const ctx = await getContext()
      const absPath = resolve(inputPath)
      try {
        log.heading('Indexing')
        const stat = statSync(absPath)
        const files: string[] = []
        if (stat.isFile()) {
          files.push(absPath)
        } else if (stat.isDirectory()) {
          for (const entry of readdirSync(absPath)) {
            if (['.md', '.mdx', '.txt'].includes(extname(entry))) {
              files.push(join(absPath, entry))
            }
          }
        }
        if (files.length === 0) { log.fail('No supported files found'); return }
        log.info(`Found ${files.length} file(s)`)
        for (const file of files) {
          const content = readFileSync(file, 'utf-8')
          const result = await ctx.pipeline.ingest({
            title: basename(file), content, sourceType: 'local',
            sourcePath: file, fileType: extname(file),
          })
          if (result.status === 'indexed') log.ok(`${basename(file)} (${result.chunks} chunks)`)
          else if (result.status === 'skipped') log.info(`${basename(file)} (unchanged)`)
          else log.fail(`${basename(file)} (error)`)
        }
      } finally {
        await shutdownContext()
      }
    })
}
