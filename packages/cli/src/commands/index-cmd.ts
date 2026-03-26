import { Command } from 'commander'
import { log } from '@opendocs/core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { readFileSync, statSync, readdirSync } from 'node:fs'
import { extname, join, basename, resolve } from 'node:path'

function collectFiles(dir: string, supported: string[]): string[] {
  const results: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      results.push(...collectFiles(fullPath, supported))
    } else if (supported.includes(extname(entry.name))) {
      results.push(fullPath)
    }
  }
  return results
}

export function indexCommand() {
  return new Command('index')
    .description('Index a file or directory')
    .argument('<path>', 'File or directory path')
    .option('--reindex', 'Force reindex even if unchanged')
    .action(async (inputPath, opts) => {
      const ctx = await getContext()
      const absPath = resolve(inputPath)
      try {
        log.heading('Indexing')
        const stat = statSync(absPath)
        const files = stat.isFile() ? [absPath] : collectFiles(absPath, ['.md', '.mdx', '.txt'])
        if (files.length === 0) { log.fail('No supported files found'); return }
        log.info(`Found ${files.length} file(s)`)
        for (const file of files) {
          if (opts.reindex) {
            // Delete existing document to force reindex (bypass content hash check)
            const docs = ctx.store.listDocuments()
            const existing = docs.find(d => d.source_path === file)
            if (existing) {
              await ctx.store.deleteDocument(existing.id)
            }
          }
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
