import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { requireRole, requireScope } from '../middleware/auth.js'

export function adminRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/admin/audit-logs', requireRole('admin'), requireScope('admin'), (c) => {
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0)
    const eventType = c.req.query('eventType') || undefined
    const workspaceId = c.req.query('workspaceId') || undefined

    const entries = ctx.auditLogger.query({ limit, offset, eventType, workspaceId })
    return c.json({ entries })
  })

  app.get('/api/v1/admin/stats', requireRole('admin'), requireScope('admin'), (c) => {
    const summary = ctx.db.get<any>(
      'SELECT COUNT(*) as docCount, COALESCE(SUM(chunk_count), 0) as chunkCount FROM documents WHERE deleted_at IS NULL'
    )

    const sourceDist = ctx.db.all<any>(
      'SELECT source_type, COUNT(*) as count FROM documents WHERE deleted_at IS NULL GROUP BY source_type'
    )
    const sourceDistribution: Record<string, number> = {}
    for (const row of sourceDist) sourceDistribution[row.source_type] = row.count

    const statusDist = ctx.db.all<any>(
      'SELECT status, COUNT(*) as count FROM documents WHERE deleted_at IS NULL GROUP BY status'
    )
    const statusDistribution: Record<string, number> = {}
    for (const row of statusDist) statusDistribution[row.status] = row.count

    const fileTypeDist = ctx.db.all<any>(
      "SELECT COALESCE(file_type, 'unknown') as ft, COUNT(*) as count FROM documents WHERE deleted_at IS NULL GROUP BY ft"
    )
    const fileTypeDistribution: Record<string, number> = {}
    for (const row of fileTypeDist) fileTypeDistribution[row.ft] = row.count

    return c.json({
      documents: summary?.docCount || 0,
      chunks: summary?.chunkCount || 0,
      workspaces: ctx.workspaceManager.list().length,
      plugins: ctx.registry.listAll().length,
      sourceDistribution,
      statusDistribution,
      fileTypeDistribution,
    })
  })

  app.get('/api/v1/admin/search-quality', requireRole('admin'), requireScope('admin'), (c) => {
    // Aggregate in SQL
    const summary = ctx.db.get<any>(
      'SELECT COUNT(*) as totalQueries, AVG(confidence_score) as avgConfidence, AVG(response_time_ms) as avgResponseTime FROM query_logs'
    )

    const intents = ctx.db.all<any>(
      'SELECT intent, COUNT(*) as count FROM query_logs GROUP BY intent'
    )
    const intentDistribution: Record<string, number> = {}
    for (const row of intents) intentDistribution[row.intent || 'general'] = row.count

    const routes = ctx.db.all<any>(
      'SELECT route, COUNT(*) as count FROM query_logs GROUP BY route'
    )
    const routeDistribution: Record<string, number> = {}
    for (const row of routes) routeDistribution[row.route || 'unknown'] = row.count

    const feedback = ctx.db.get<any>(
      `SELECT
        SUM(CASE WHEN feedback = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN feedback = 'negative' THEN 1 ELSE 0 END) as negative
      FROM query_logs WHERE feedback IS NOT NULL`
    )

    return c.json({
      totalQueries: summary?.totalQueries || 0,
      avgConfidence: Math.round((summary?.avgConfidence || 0) * 100) / 100,
      avgResponseTimeMs: Math.round(summary?.avgResponseTime || 0),
      intentDistribution,
      routeDistribution,
      feedback: { positive: feedback?.positive || 0, negative: feedback?.negative || 0 },
    })
  })

  app.get('/api/v1/admin/query-logs', requireRole('admin'), requireScope('admin'), (c) => {
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 500)
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0)
    const intent = c.req.query('intent')
    const route = c.req.query('route')

    let sql = 'SELECT * FROM query_logs WHERE 1=1'
    const params: unknown[] = []

    if (intent) { sql += ' AND intent = ?'; params.push(intent) }
    if (route) { sql += ' AND route = ?'; params.push(route) }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const logs = ctx.db.all<any>(sql, params)

    let countSql = 'SELECT COUNT(*) as count FROM query_logs WHERE 1=1'
    const countParams: unknown[] = []
    if (intent) { countSql += ' AND intent = ?'; countParams.push(intent) }
    if (route) { countSql += ' AND route = ?'; countParams.push(route) }
    const total = ctx.db.get<any>(countSql, countParams)

    return c.json({ logs, total: total?.count || 0, limit, offset })
  })

  app.get('/api/v1/admin/plugins', requireRole('admin'), requireScope('admin'), async (c) => {
    const plugins = ctx.registry.listAll()
    const details = await Promise.all(
      plugins.map(async (p) => {
        const plugin = ctx.registry.get(p.name)
        let health: { healthy: boolean; message?: string } = { healthy: true, message: 'Unknown' }
        let metrics = {}

        try {
          if (plugin?.healthCheck) health = await plugin.healthCheck()
        } catch (err) {
          health = { healthy: false, message: (err as Error).message }
        }

        try {
          if (plugin?.metrics) metrics = await plugin.metrics()
        } catch (err) {
          metrics = { error: (err as Error).message }
        }

        return { ...p, health, metrics }
      })
    )

    return c.json({ plugins: details })
  })

  app.get('/api/v1/admin/benchmark', requireRole('admin'), requireScope('admin'), async (c) => {
    const models = ctx.registry.getModels()

    const benchmarks = await Promise.all(
      models.map(async (model) => {
        const result: {
          name: string
          version: string
          capabilities: Record<string, boolean | undefined>
          health: { healthy: boolean; message?: string } | null
          generation: { latencyMs: number; tokensPerSec: number } | null | { error: string }
          embedding: { latencyMs: number; textsPerSec: number } | null | { error: string }
        } = {
          name: model.name,
          version: model.version,
          capabilities: model.capabilities,
          health: null,
          generation: null,
          embedding: null,
        }

        // Health check
        try {
          if (model.healthCheck) {
            result.health = await model.healthCheck()
          } else {
            result.health = { healthy: true, message: 'No health check available' }
          }
        } catch (err) {
          result.health = { healthy: false, message: (err as Error).message }
        }

        // Generation benchmark
        if (model.capabilities.llm && model.generate) {
          try {
            const start = performance.now()
            let fullText = ''
            for await (const chunk of model.generate('Hello, respond with exactly one short sentence.', { maxTokens: 50 })) {
              fullText += chunk
            }
            const latencyMs = performance.now() - start
            const estimatedTokens = Math.max(1, Math.round(fullText.length / 4))
            result.generation = {
              latencyMs: Math.round(latencyMs),
              tokensPerSec: Math.round((estimatedTokens / latencyMs) * 1000),
            }
          } catch (err) {
            result.generation = { error: (err as Error).message }
          }
        }

        // Embedding benchmark
        if (model.capabilities.embedding && model.embed) {
          try {
            const testTexts = ['The quick brown fox jumps over the lazy dog.', 'OpenDocuments is a self-hosted RAG platform.']
            const start = performance.now()
            await model.embed(testTexts)
            const latencyMs = performance.now() - start
            result.embedding = {
              latencyMs: Math.round(latencyMs),
              textsPerSec: Math.round((testTexts.length / latencyMs) * 1000),
            }
          } catch (err) {
            result.embedding = { error: (err as Error).message }
          }
        }

        return result
      })
    )

    return c.json({ benchmarks })
  })

  // Workspaces endpoint (public, no admin required)
  app.get('/api/v1/workspaces', (c) => {
    const workspaces = ctx.workspaceManager.list()
    return c.json({ workspaces })
  })

  app.get('/api/v1/admin/connectors', requireRole('admin'), requireScope('admin'), (c) => {
    const connectors = ctx.connectorManager.listConnectors()
    return c.json({ connectors })
  })

  return app
}
