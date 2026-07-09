import { Command } from 'commander'
import { log, discoverFiles, FileWatcher, type FileChange } from 'opendocuments-core'
import { getContext, shutdownContext } from '../utils/bootstrap.js'
import { readFileSync } from 'node:fs'
import { extname, basename, resolve } from 'node:path'

type FileWatcherCtor = new (
  dir: string,
  extensions: Set<string>,
  onChange: (changes: FileChange[]) => void | Promise<void>,
  options?: number | { pollIntervalMs?: number; ignoreInitial?: boolean; stableMs?: number }
) => FileWatcher

interface ForceIngestPipeline {
  ingest(
    input: {
      title: string
      content: string | Buffer
      sourceType: string
      sourcePath: string
      fileType?: string
    },
    options?: { force?: boolean }
  ): Promise<{ documentId: string; chunks: number; status: 'indexed' | 'skipped' | 'error' }>
}

const WATCH_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt',
  '.json', '.yaml', '.yml', '.toml',
  '.zip', '.pdf', '.docx', '.pptx',
  '.xlsx', '.xls', '.csv',
  '.html', '.htm', '.ipynb', '.eml',
])

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
      const readContent = (file: string): string | Buffer =>
        textExtensions.has(extname(file)) ? readFileSync(file, 'utf-8') : readFileSync(file)
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
        const pipeline = ctx.pipeline as unknown as ForceIngestPipeline
        for (const file of files) {
          const ext = extname(file)
          const content = readContent(file)
          const result = await pipeline.ingest({
            title: basename(file), content, sourceType: 'local',
            sourcePath: file, fileType: extname(file),
          }, { force: Boolean(opts.reindex) })
          if (result.status === 'indexed') log.ok(`${basename(file)} (${result.chunks} chunks)`)
          else if (result.status === 'skipped') log.info(`${basename(file)} (unchanged)`)
          else log.fail(`${basename(file)} (error)`)
        }

        // After the normal indexing loop, if --watch:
        if (opts.watch) {
          log.info('Watching for changes... (Ctrl+C to stop)')
          const Watcher = FileWatcher as FileWatcherCtor
          const watcher = new Watcher(
            absPath,
            WATCH_EXTENSIONS,
            async (changes) => {
              for (const change of changes) {
                if (change.type === 'deleted') {
                  const existing = ctx.store.getDocumentBySourcePath(change.path)
                  if (existing) {
                    await ctx.store.hardDeleteDocument(existing.id)
                    log.ok(`deleted: ${basename(change.path)}`)
                  } else {
                    log.info(`deleted: ${basename(change.path)} (not indexed)`)
                  }
                } else {
                  const content = readContent(change.path)
                  const result = await ctx.pipeline.ingest({
                    title: basename(change.path), content, sourceType: 'local',
                    sourcePath: change.path, fileType: extname(change.path),
                  })
                  if (result.status === 'indexed') log.ok(`${change.type}: ${basename(change.path)} (${result.chunks} chunks)`)
                  else if (result.status === 'skipped') log.info(`${change.type}: ${basename(change.path)} (unchanged)`)
                  else log.fail(`${change.type}: ${basename(change.path)} (error)`)
                }
              }
            },
            { ignoreInitial: true }
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
