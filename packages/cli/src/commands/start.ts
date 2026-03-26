import { Command } from 'commander'
import { log } from '@opendocs/core'
import { bootstrap, createApp, startMCPServer } from '@opendocs/server'
import { serve } from '@hono/node-server'

export function startCommand() {
  return new Command('start')
    .description('Start OpenDocs server')
    .option('-p, --port <port>', 'Port number', '3000')
    .option('--mcp-only', 'Start MCP server only (stdio mode)')
    .action(async (opts) => {
      log.heading('OpenDocs Server')
      if (opts.mcpOnly) {
        log.wait('Starting MCP server (stdio mode)...')
        const ctx = await bootstrap()
        await startMCPServer(ctx)
        return
      }
      log.wait('Bootstrapping...')
      const ctx = await bootstrap()
      const app = createApp(ctx)
      const port = parseInt(opts.port)
      serve({ fetch: app.fetch, port }, () => {
        log.ok(`Server running at http://localhost:${port}`)
        log.arrow(`API: http://localhost:${port}/api/v1`)
        log.dim('Press Ctrl+C to stop')
      })
      process.on('SIGINT', async () => {
        log.blank()
        log.wait('Shutting down...')
        await ctx.shutdown()
        log.ok('Goodbye')
        process.exit(0)
      })
    })
}
