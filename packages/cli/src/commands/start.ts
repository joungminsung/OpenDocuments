import { Command } from 'commander'
import { log } from 'opendocuments-core'
import { bootstrap, createApp, startMCPServer } from 'opendocuments-server'
import { serve } from '@hono/node-server'
import { resolve, dirname, join } from 'node:path'
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isRecordedServerProcess, readServerPid, resolveInstanceDataDir } from '../utils/instance.js'

function findWebDistDir(): string | null {
  // Try monorepo path: packages/web/dist relative to cwd
  const monorepoPath = resolve(process.cwd(), 'packages/web/dist')
  if (existsSync(monorepoPath)) return monorepoPath

  // Try relative to this file's location (dist/commands/start.js -> ../../../web/dist)
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const packagedPath = resolve(thisDir, '../../web-dist')
    if (existsSync(packagedPath)) return packagedPath

    const relativePath = resolve(thisDir, '../../../web/dist')
    if (existsSync(relativePath)) return relativePath
  } catch {}

  return null
}

function printBootstrapHelp(errorMessage: string): void {
  const msg = errorMessage.toLowerCase()
  log.blank()
  log.info('Troubleshooting suggestions:')
  if (msg.includes('econnrefused') || msg.includes('connect') || msg.includes('ollama')) {
    log.arrow('Ollama may not be running. Start it with:  ollama serve')
    log.arrow('Install Ollama from: https://ollama.com/download')
  }
  if (msg.includes('model') || msg.includes('not found')) {
    log.arrow('The requested model may not be installed. Pull it with:  ollama pull <model-name>')
  }
  if (msg.includes('config') || msg.includes('validation') || msg.includes('parse')) {
    log.arrow('Check your configuration file for syntax errors or invalid values.')
  }
  log.arrow('Run diagnostics with:  opendocuments doctor')
}

export function startCommand() {
  return new Command('start')
    .description('Start OpenDocuments server')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--mcp-only', 'Start MCP server only (stdio mode)')
    .option('--no-web', 'Disable web UI static serving')
    .action(async (opts: { port: string; mcpOnly?: boolean; web?: boolean }) => {
      log.heading('OpenDocuments Server')
      if (opts.mcpOnly) {
        log.wait('Starting MCP server (stdio mode)...')
        let ctx: Awaited<ReturnType<typeof bootstrap>>
        try {
          ctx = await bootstrap()
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          log.fail(`Failed to bootstrap: ${message}`)
          printBootstrapHelp(message)
          process.exit(1)
        }
        await startMCPServer(ctx)
        return
      }

      const port = parseInt(opts.port, 10)
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        log.fail('Port must be an integer between 1 and 65535')
        process.exitCode = 1
        return
      }

      // Resolve and verify this instance before opening its database or vector store.
      const dataDir = resolveInstanceDataDir()
      const pidFile = join(dataDir, 'server.pid')
      const previousPid = readServerPid(pidFile)
      if (previousPid && isRecordedServerProcess(previousPid)) {
        log.fail(`This instance is already running with PID ${previousPid.pid}`)
        process.exitCode = 1
        return
      }

      log.wait('Bootstrapping...')
      let ctx: Awaited<ReturnType<typeof bootstrap>>
      try {
        ctx = await bootstrap()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        log.fail(`Failed to bootstrap: ${message}`)
        printBootstrapHelp(message)
        process.exit(1)
      }

      // Find web UI dist directory (unless disabled)
      let webDir: string | undefined
      if (opts.web !== false) {
        const found = findWebDistDir()
        webDir = found ?? undefined
      }

      const app = createApp(ctx, { webDir })
      mkdirSync(dataDir, { recursive: true })
      const pidRecord = {
        pid: process.pid,
        dataDir,
        entrypoint: process.argv[1] || fileURLToPath(import.meta.url),
        startedAt: new Date().toISOString(),
      }

      let pidWritten = false
      const removeOwnPid = () => {
        if (!pidWritten) return
        const current = readServerPid(pidFile)
        if (current?.pid !== process.pid) return
        try { unlinkSync(pidFile) } catch {}
        pidWritten = false
      }
      const server = serve({ fetch: app.fetch, port }, () => {
        try {
          writeFileSync(pidFile, JSON.stringify(pidRecord, null, 2) + '\n', { mode: 0o600 })
          pidWritten = true
        } catch (error) {
          log.fail(`Server started but its PID record could not be written: ${error instanceof Error ? error.message : String(error)}`)
          void shutdown(1)
          return
        }
        log.ok(`Server running at http://localhost:${port}`)
        log.arrow(`API: http://localhost:${port}/api/v1`)
        if (webDir) {
          log.ok(`Web UI: http://localhost:${port}`)
        } else {
          log.info('Web UI not found (run: cd packages/web && npm run build)')
        }
        log.dim('Press Ctrl+C to stop')
      })
      let shuttingDown = false
      const shutdown = async (exitCode = 0) => {
        if (shuttingDown) return
        shuttingDown = true
        log.blank()
        log.wait('Shutting down...')
        removeOwnPid()
        await new Promise<void>((resolveClose) => {
          try {
            server.close(() => resolveClose())
          } catch {
            resolveClose()
          }
        })
        await ctx.shutdown()
        process.exitCode = exitCode
        if (exitCode === 0) log.ok('Goodbye')
      }
      server.on('error', (error) => {
        log.fail(`Server failed to listen on port ${port}: ${error.message}`)
        void shutdown(1)
      })
      process.on('SIGINT', () => void shutdown())
      process.on('SIGTERM', () => void shutdown())
    })
}
