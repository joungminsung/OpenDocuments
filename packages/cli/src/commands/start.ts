import { Command } from 'commander'
import { log } from '@opendocuments/core'
import { bootstrap, createApp, startMCPServer } from '@opendocuments/server'
import { serve } from '@hono/node-server'
import { resolve, dirname, join } from 'node:path'
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function findWebDistDir(): string | null {
  // Try monorepo path: packages/web/dist relative to cwd
  const monorepoPath = resolve(process.cwd(), 'packages/web/dist')
  if (existsSync(monorepoPath)) return monorepoPath

  // Try relative to this file's location (dist/commands/start.js -> ../../../web/dist)
  try {
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const relativePath = resolve(thisDir, '../../../web/dist')
    if (existsSync(relativePath)) return relativePath
  } catch {}

  // Try to find via require.resolve for npm-installed case
  try {
    // @ts-ignore
    const webPkg = require.resolve('@opendocuments/web/package.json')
    const webDist = resolve(dirname(webPkg), 'dist')
    if (existsSync(webDist)) return webDist
  } catch {}

  return null
}

export function startCommand() {
  return new Command('start')
    .description('Start OpenDocuments server')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--mcp-only', 'Start MCP server only (stdio mode)')
    .option('--no-web', 'Disable web UI static serving')
    .action(async (opts) => {
      log.heading('OpenDocuments Server')
      if (opts.mcpOnly) {
        log.wait('Starting MCP server (stdio mode)...')
        const ctx = await bootstrap()
        await startMCPServer(ctx)
        return
      }
      log.wait('Bootstrapping...')
      const ctx = await bootstrap()

      // Find web UI dist directory (unless disabled)
      let webDir: string | undefined
      if (opts.web !== false) {
        const found = findWebDistDir()
        webDir = found ?? undefined
      }

      const app = createApp(ctx, { webDir })
      const port = parseInt(opts.port)
      // Write PID file for `opendocuments stop`
      const pidDir = join(process.env.HOME || '~', '.opendocuments')
      const pidFile = join(pidDir, 'server.pid')
      mkdirSync(pidDir, { recursive: true })
      writeFileSync(pidFile, String(process.pid))

      serve({ fetch: app.fetch, port }, () => {
        log.ok(`Server running at http://localhost:${port}`)
        log.arrow(`API: http://localhost:${port}/api/v1`)
        if (webDir) {
          log.ok(`Web UI: http://localhost:${port}`)
        } else {
          log.info('Web UI not found (run: cd packages/web && npm run build)')
        }
        log.dim('Press Ctrl+C to stop')
      })
      process.on('SIGINT', async () => {
        log.blank()
        log.wait('Shutting down...')
        try { unlinkSync(pidFile) } catch {}
        await ctx.shutdown()
        log.ok('Goodbye')
        process.exit(0)
      })
    })
}
