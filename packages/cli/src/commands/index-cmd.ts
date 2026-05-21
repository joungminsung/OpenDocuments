import { Command } from 'commander'
import { log, discoverFiles, FileWatcher } from 'opendocuments-core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { readFileSync } from 'node:fs'
import { extname, basename, resolve } from 'node:path'

export function indexCommand() {
  return new Command('index')
    .description('Index a file or directory')
    .argument('<path>', 'File or directory path')
    .option('--reindex', 'Force reindex even if unchanged')
    .option('--watch', 'Watch for file changes')
    .action(async (inputPath, opts) => {
      const ctx = await getContext()
      const absPath = resolve(inputPath)
      const textExtensions = new Set(['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml', '.csv', '.html', '.htm', '.ipynb'])
      try {
        log.heading('Indexing')
        let files: string[]
        try {
          files = discoverFiles(absPath)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('ENOENT')) {
            log.fail(`Path not found: ${absPath}`)
          } else if (message.includes('EACCES')) {
            log.fail(`Permission denied: ${absPath}`)
          } else {
            log.fail(`Cannot access path: ${message}`)
          }
          return
        }
        if (files.length === 0) { log.fail('No supported files found'); return }
        log.info(`Found ${files.length} file(s)`)
        for (const file of files) {
          if (opts.reindex) {
            // Delete existing document to force reindex (bypass content hash check)
            const docs = ctx.store.listDocuments()
            const existing = docs.find(d => d.source_path === file)
            if (existing) {
              await ctx.store.hardDeleteDocument(existing.id)
            }
          }
          const ext = extname(file)
          const content = textExtensions.has(ext) ? readFileSync(file, 'utf-8') : readFileSync(file)
          const result = await ctx.pipeline.ingest({
            title: basename(file), content, sourceType: 'local',
            sourcePath: file, fileType: extname(file),
          })
          if (result.status === 'indexed') log.ok(`${basename(file)} (${result.chunks} chunks)`)
          else if (result.status === 'skipped') log.info(`${basename(file)} (unchanged)`)
          else log.fail(`${basename(file)} (error)`)
        }

        // After the normal indexing loop, if --watch:
        if (opts.watch) {
          log.info('Watching for changes... (Ctrl+C to stop)')
          const watcher = new FileWatcher(
            absPath,
            new Set(['.md', '.mdx', '.txt', '.pdf', '.docx', '.xlsx', '.html', '.ipynb', '.eml']),
            async (changes) => {
              for (const change of changes) {
                if (change.type === 'deleted') {
                  log.info(`Deleted: ${change.path}`)
                } else {
                  const content = readFileSync(change.path, textExtensions.has(extname(change.path)) ? 'utf-8' : undefined as any)
                  const result = await ctx.pipeline.ingest({
                    title: basename(change.path), content, sourceType: 'local',
                    sourcePath: change.path, fileType: extname(change.path),
                  })
                  log.ok(`${change.type}: ${basename(change.path)} (${result.chunks} chunks)`)
                }
              }
            }
          )
          watcher.start()
          // Keep process alive
          await new Promise(() => {})
        }
      } finally {
        if (!opts.watch) {
          await shutdownContext()
        }
      }
    })
}
