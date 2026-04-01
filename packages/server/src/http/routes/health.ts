import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'

type CheckStatus = 'ok' | 'error' | 'warning'

interface CheckResult {
  status: CheckStatus
  message?: string
}

export function healthRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/health', (c) => c.json({ status: 'ok', version: '0.2.0' }))

  app.get('/api/v1/stats', (c) => {
    const docs = ctx.store.listDocuments()
    const workspaces = ctx.workspaceManager.list()
    const plugins = ctx.registry.listAll()
    return c.json({ documents: docs.length, workspaces: workspaces.length, plugins: plugins.length, pluginList: plugins })
  })

  app.get('/api/v1/healthz', (c) => c.json({ status: 'ok' }, 200))

  app.get('/api/v1/readyz', async (c) => {
    const checks: Record<string, CheckResult> = {}
    let allOk = true

    // SQLite connectivity check
    try {
      ctx.db.get('SELECT 1')
      checks.sqlite = { status: 'ok' }
    } catch (err) {
      checks.sqlite = { status: 'error', message: (err as Error).message }
      allOk = false
    }

    // VectorDB connectivity check
    try {
      await ctx.vectorDb.count('chunks')
      checks.vectorDb = { status: 'ok' }
    } catch (err) {
      checks.vectorDb = { status: 'error', message: (err as Error).message }
      allOk = false
    }

    // Model plugin health checks
    const models = ctx.registry.getModels()
    for (const model of models) {
      if (typeof model.healthCheck === 'function') {
        try {
          const result = await model.healthCheck()
          checks[`model:${model.name}`] = result.healthy
            ? { status: 'ok', message: result.message }
            : { status: 'warning', message: result.message }
        } catch (err) {
          checks[`model:${model.name}`] = { status: 'error', message: (err as Error).message }
          allOk = false
        }
      }
    }

    if (allOk) {
      return c.json({ status: 'ready', checks }, 200)
    }
    return c.json({ status: 'not_ready', checks }, 503)
  })

  return app
}
