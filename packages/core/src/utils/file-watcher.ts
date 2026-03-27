import { statSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'

export interface FileChange {
  path: string
  type: 'added' | 'modified' | 'deleted'
}

export class FileWatcher {
  private fileHashes = new Map<string, number>() // path -> mtime
  private interval: ReturnType<typeof setInterval> | null = null

  constructor(
    private dir: string,
    private extensions: Set<string>,
    private onChange: (changes: FileChange[]) => void,
    private pollIntervalMs = 3000
  ) {}

  start(): void {
    // Initial scan
    this.scan()
    this.interval = setInterval(() => this.scan(), this.pollIntervalMs)
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
  }

  private scan(): void {
    const currentFiles = new Map<string, number>()
    this.walkDir(this.dir, currentFiles)

    const changes: FileChange[] = []

    // Check for added/modified
    for (const [path, mtime] of currentFiles) {
      const prev = this.fileHashes.get(path)
      if (!prev) changes.push({ path, type: 'added' })
      else if (prev !== mtime) changes.push({ path, type: 'modified' })
    }

    // Check for deleted
    for (const [path] of this.fileHashes) {
      if (!currentFiles.has(path)) changes.push({ path, type: 'deleted' })
    }

    this.fileHashes = currentFiles

    if (changes.length > 0) this.onChange(changes)
  }

  private walkDir(dir: string, files: Map<string, number>): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) this.walkDir(fullPath, files)
        else if (this.extensions.has(extname(entry.name))) {
          try { files.set(fullPath, statSync(fullPath).mtimeMs) } catch (err) {
            // Log but don't crash -- file may be temporarily unavailable
            console.error(`FileWatcher error: ${(err as Error).message}`)
          }
        }
      }
    } catch (err) {
      // Log but don't crash -- file may be temporarily unavailable
      console.error(`FileWatcher error: ${(err as Error).message}`)
    }
  }
}
