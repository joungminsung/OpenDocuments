import { statSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'

export interface FileChange {
  path: string
  type: 'added' | 'modified' | 'deleted'
}

export interface FileWatcherOptions {
  pollIntervalMs?: number
  ignoreInitial?: boolean
  stableMs?: number
}

interface FileState {
  mtimeMs: number
  size: number
}

export class FileWatcher {
  private fileHashes = new Map<string, FileState>()
  private interval: ReturnType<typeof setInterval> | null = null
  private isScanning = false
  private readonly pollIntervalMs: number
  private readonly ignoreInitial: boolean
  private readonly stableMs: number

  constructor(
    private dir: string,
    private extensions: Set<string>,
    private onChange: (changes: FileChange[]) => void | Promise<void>,
    options: number | FileWatcherOptions = 3000
  ) {
    const opts = typeof options === 'number' ? { pollIntervalMs: options } : options
    this.pollIntervalMs = opts.pollIntervalMs ?? 3000
    this.ignoreInitial = opts.ignoreInitial ?? false
    this.stableMs = opts.stableMs ?? 500
  }

  start(): void {
    void this.scan({ emitInitial: !this.ignoreInitial })
    this.interval = setInterval(() => { void this.scan() }, this.pollIntervalMs)
  }

  stop(): void {
    if (this.interval) { clearInterval(this.interval); this.interval = null }
  }

  private async scan(opts: { emitInitial?: boolean } = {}): Promise<void> {
    if (this.isScanning) return
    this.isScanning = true
    try {
      const currentFiles = new Map<string, FileState>()
      this.walkDir(this.dir, currentFiles)

      const changes: FileChange[] = []
      const nextHashes = new Map<string, FileState>()

      // Check for added/modified
      for (const [path, state] of currentFiles) {
        const prev = this.fileHashes.get(path)
        const isStable = Date.now() - state.mtimeMs >= this.stableMs
        if (!prev) {
          if (opts.emitInitial === false) {
            nextHashes.set(path, state)
            continue
          }
          if (!isStable) continue
          changes.push({ path, type: 'added' })
        } else if (prev.mtimeMs !== state.mtimeMs || prev.size !== state.size) {
          if (!isStable) {
            nextHashes.set(path, prev)
            continue
          }
          changes.push({ path, type: 'modified' })
        }
        nextHashes.set(path, state)
      }

      // Check for deleted
      for (const [path] of this.fileHashes) {
        if (!currentFiles.has(path)) changes.push({ path, type: 'deleted' })
      }

      this.fileHashes = nextHashes

      if (changes.length > 0) await this.onChange(changes)
    } finally {
      this.isScanning = false
    }
  }

  private walkDir(dir: string, files: Map<string, FileState>): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) this.walkDir(fullPath, files)
        else if (this.extensions.has(extname(entry.name))) {
          try {
            const stat = statSync(fullPath)
            files.set(fullPath, { mtimeMs: stat.mtimeMs, size: stat.size })
          } catch (err) {
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
