import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'

export function healthRoutes(ctx: AppContext) {
  const app = new Hono()
  app.get('/api/v1/health', (c) => c.json({ status: 'ok', version: '0.1.0' }))
  app.get('/api/v1/stats', (c) => {
    const docs = ctx.store.listDocuments()
    const workspaces = ctx.workspaceManager.list()
    const plugins = ctx.registry.listAll()
    return c.json({ documents: docs.length, workspaces: workspaces.length, plugins: plugins.length, pluginList: plugins })
  })
  return app
}
