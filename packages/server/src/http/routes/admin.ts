import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { requireRole, requireScope } from '../middleware/auth.js'
import { resolveRequestWorkspaceId } from '../workspace.js'
import type { ConnectorPlugin, PluginContext } from 'opendocuments-core'
import { dirname } from 'node:path'

const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const GITHUB_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/
const CONNECTOR_NAME_PATTERN = /^[A-Za-z0-9._-]{1,80}$/
const CONFIGURABLE_CONNECTOR_TYPES = new Set([
  'notion',
  'gdrive',
  's3',
  'confluence',
  'swagger',
  'web-crawler',
])

interface GitHubConnectorRequest {
  repo?: string
  token?: string
  branch?: string
  paths?: string[]
  syncInterval?: number
}

interface GitHubConnectorConfig {
  type: 'github'
  repo: string
  token?: string
  branch: string
  paths?: string[]
  syncInterval?: number
}

interface DocumentStatsRow extends Record<string, unknown> {
  docCount: number
  chunkCount: number
}

interface SourceCountRow extends Record<string, unknown> {
  source_type: string
  count: number
}

interface StatusCountRow extends Record<string, unknown> {
  status: string
  count: number
}

interface FileTypeCountRow extends Record<string, unknown> {
  ft: string
  count: number
}

interface SearchQualityRow extends Record<string, unknown> {
  totalQueries: number
  avgConfidence: number | null
  avgResponseTime: number | null
}

interface IntentCountRow extends Record<string, unknown> {
  intent: string | null
  count: number
}

interface RouteCountRow extends Record<string, unknown> {
  route: string | null
  count: number
}

interface FeedbackCountRow extends Record<string, unknown> {
  positive: number | null
  negative: number | null
}

interface QueryLogRow extends Record<string, unknown> {}

interface CountRow extends Record<string, unknown> {
  count: number
}

function sanitizeConnector(connector: {
  name: string
  connectorId: string
  type: string
  status: string
  lastSyncedAt: string | null
  syncIntervalSeconds?: number | null
  repo?: string
  errorMessage?: string
}) {
  return connector
}

async function createGitHubConnector(config: GitHubConnectorConfig, dataDir: string): Promise<ConnectorPlugin> {
  const packageName = '@opendocuments/connector-github'
  const mod = await import(/* @vite-ignore */ packageName)
  const ConnectorClass = mod.default
  if (typeof ConnectorClass !== 'function') {
    throw new Error('GitHub connector package does not export a connector class')
  }

  const connector = new ConnectorClass() as ConnectorPlugin
  const connectorCtx: PluginContext = {
    config: config as unknown as Record<string, unknown>,
    dataDir,
    log: {
      ok: (msg: string) => console.log(`[ok] ${msg}`),
      fail: (msg: string) => console.error(`[fail] ${msg}`),
      info: (msg: string) => console.log(`[info] ${msg}`),
      wait: (msg: string) => console.log(`[wait] ${msg}`),
    },
  }
  await connector.setup(connectorCtx)
  return connector
}

export function adminRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/admin/audit-logs', requireRole('admin'), requireScope('admin'), (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '100', 10) || 100, 1), 500)
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0)
    const eventType = c.req.query('eventType') || undefined

    const entries = ctx.auditLogger.query({
      limit,
      offset,
      eventType,
      workspaceId,
    })
    return c.json({ entries })
  })

  app.get('/api/v1/admin/stats', requireRole('admin'), requireScope('admin'), (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const summary = ctx.db.get<DocumentStatsRow>(
      'SELECT COUNT(*) as docCount, COALESCE(SUM(chunk_count), 0) as chunkCount FROM documents WHERE deleted_at IS NULL AND workspace_id = ?',
      [workspaceId]
    )

    const sourceDist = ctx.db.all<SourceCountRow>(
      'SELECT source_type, COUNT(*) as count FROM documents WHERE deleted_at IS NULL AND workspace_id = ? GROUP BY source_type',
      [workspaceId]
    )
    const sourceDistribution: Record<string, number> = {}
    for (const row of sourceDist) sourceDistribution[row.source_type] = row.count

    const statusDist = ctx.db.all<StatusCountRow>(
      'SELECT status, COUNT(*) as count FROM documents WHERE deleted_at IS NULL AND workspace_id = ? GROUP BY status',
      [workspaceId]
    )
    const statusDistribution: Record<string, number> = {}
    for (const row of statusDist) statusDistribution[row.status] = row.count

    const fileTypeDist = ctx.db.all<FileTypeCountRow>(
      "SELECT COALESCE(file_type, 'unknown') as ft, COUNT(*) as count FROM documents WHERE deleted_at IS NULL AND workspace_id = ? GROUP BY ft",
      [workspaceId]
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
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    // Aggregate in SQL
    const summary = ctx.db.get<SearchQualityRow>(
      'SELECT COUNT(*) as totalQueries, AVG(confidence_score) as avgConfidence, AVG(response_time_ms) as avgResponseTime FROM query_logs WHERE workspace_id = ?',
      [workspaceId]
    )

    const intents = ctx.db.all<IntentCountRow>(
      'SELECT intent, COUNT(*) as count FROM query_logs WHERE workspace_id = ? GROUP BY intent',
      [workspaceId]
    )
    const intentDistribution: Record<string, number> = {}
    for (const row of intents) intentDistribution[row.intent || 'general'] = row.count

    const routes = ctx.db.all<RouteCountRow>(
      'SELECT route, COUNT(*) as count FROM query_logs WHERE workspace_id = ? GROUP BY route',
      [workspaceId]
    )
    const routeDistribution: Record<string, number> = {}
    for (const row of routes) routeDistribution[row.route || 'unknown'] = row.count

    const feedback = ctx.db.get<FeedbackCountRow>(
      `SELECT
        SUM(CASE WHEN feedback = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN feedback = 'negative' THEN 1 ELSE 0 END) as negative
      FROM query_logs WHERE feedback IS NOT NULL AND workspace_id = ?`,
      [workspaceId]
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
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 500)
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0)
    const intent = c.req.query('intent')
    const route = c.req.query('route')

    let sql = 'SELECT * FROM query_logs WHERE workspace_id = ?'
    const params: unknown[] = [workspaceId]

    if (intent) { sql += ' AND intent = ?'; params.push(intent) }
    if (route) { sql += ' AND route = ?'; params.push(route) }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const logs = ctx.db.all<QueryLogRow>(sql, params)

    let countSql = 'SELECT COUNT(*) as count FROM query_logs WHERE workspace_id = ?'
    const countParams: unknown[] = [workspaceId]
    if (intent) { countSql += ' AND intent = ?'; countParams.push(intent) }
    if (route) { countSql += ' AND route = ?'; countParams.push(route) }
    const total = ctx.db.get<CountRow>(countSql, countParams)

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
  app.get('/api/v1/workspaces', requireScope('document:read'), (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const workspace = ctx.workspaceManager.getById(workspaceId)
    return c.json({ workspaces: workspace ? [workspace] : [] })
  })

  app.get('/api/v1/admin/connectors', requireRole('admin'), requireScope('admin'), (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const connectors = ctx.forWorkspace(workspaceId).connectorManager.listConnectors()
    return c.json({ connectors })
  })

  app.post('/api/v1/admin/connectors/github', requireRole('admin'), requireScope('admin'), async (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const body = (await c.req.json<GitHubConnectorRequest>().catch(() => ({}))) as GitHubConnectorRequest
    const repo = body.repo?.trim()
    const branch = body.branch?.trim() || 'main'
    const token = body.token?.trim() || undefined
    const paths = Array.isArray(body.paths)
      ? body.paths.map(p => p.trim()).filter(Boolean)
      : undefined
    const syncInterval = body.syncInterval && Number.isFinite(body.syncInterval)
      ? Math.max(60, Math.floor(body.syncInterval))
      : 300

    if (!repo || !GITHUB_REPO_PATTERN.test(repo)) {
      return c.json({ error: 'GitHub repo must be in owner/repo format.' }, 400)
    }
    if (!GITHUB_BRANCH_PATTERN.test(branch)) {
      return c.json({ error: 'GitHub branch contains invalid characters.' }, 400)
    }

    const config: GitHubConnectorConfig = {
      type: 'github',
      repo,
      branch,
      ...(token ? { token } : {}),
      ...(paths && paths.length > 0 ? { paths } : {}),
      syncInterval,
    }

    try {
      const connector = await createGitHubConnector(config, dirname(ctx.pluginManifestPath))
      const health = await connector.healthCheck?.()
      if (health && !health.healthy) {
        return c.json({ error: `GitHub connection failed: ${health.message || 'unhealthy'}` }, 400)
      }

      const manager = ctx.forWorkspace(workspaceId).connectorManager
      const connectorId = await manager.registerOwnedConnector(connector, {
        name: 'github',
        syncIntervalSeconds: syncInterval,
        autoSync: true,
        config: config as unknown as Record<string, unknown>,
      })
      const registered = manager.listConnectors().find(conn => conn.connectorId === connectorId)

      return c.json({
        connector: registered ? sanitizeConnector(registered) : {
          name: 'github',
          connectorId,
          type: connector.name,
          status: 'active',
          lastSyncedAt: null,
          repo,
        },
        health: health || { healthy: true },
      }, 201)
    } catch (err) {
      return c.json({ error: `Failed to configure GitHub connector: ${(err as Error).message}` }, 500)
    }
  })

  app.post('/api/v1/admin/connectors/github/sync', requireRole('admin'), requireScope('admin'), async (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    try {
      const result = await ctx.forWorkspace(workspaceId).connectorManager.syncConnector('github')
      return c.json({ result })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 404)
    }
  })

  app.post('/api/v1/admin/connectors/:type', requireRole('admin'), requireScope('admin'), async (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const type = c.req.param('type') || ''
    if (!CONFIGURABLE_CONNECTOR_TYPES.has(type)) {
      return c.json({ error: `Unsupported configurable connector type: ${type}` }, 400)
    }

    const body = await c.req.json<{
      name?: unknown
      config?: unknown
      syncInterval?: unknown
      autoSync?: unknown
    }>().catch(() => ({})) as {
      name?: unknown
      config?: unknown
      syncInterval?: unknown
      autoSync?: unknown
    }
    const name = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : type
    if (!CONNECTOR_NAME_PATTERN.test(name)) {
      return c.json({ error: 'Connector name may contain only letters, numbers, dot, underscore, and dash.' }, 400)
    }
    if (!body.config || typeof body.config !== 'object' || Array.isArray(body.config)) {
      return c.json({ error: 'Connector config must be a JSON object.' }, 400)
    }
    const syncInterval = typeof body.syncInterval === 'number' && Number.isFinite(body.syncInterval)
      ? Math.max(60, Math.floor(body.syncInterval))
      : 300
    const connectorConfig = {
      ...(body.config as Record<string, unknown>),
      type,
      syncInterval,
    }

    try {
      const connector = await ctx.createConnector(connectorConfig)
      if (!connector) return c.json({ error: `Connector ${type} could not be created.` }, 500)
      const health = await connector.healthCheck?.()
      if (health && !health.healthy) {
        await connector.teardown?.()
        return c.json({ error: `${type} connection failed: ${health.message || 'unhealthy'}` }, 400)
      }

      const manager = ctx.forWorkspace(workspaceId).connectorManager
      const connectorId = await manager.registerOwnedConnector(connector, {
        name,
        syncIntervalSeconds: syncInterval,
        autoSync: body.autoSync !== false,
        config: connectorConfig,
      })
      const registered = manager.listConnectors().find((item) => item.connectorId === connectorId)
      return c.json({
        connector: registered ? sanitizeConnector(registered) : {
          name,
          connectorId,
          type: connector.name,
          status: 'active',
          lastSyncedAt: null,
        },
        health: health || { healthy: true },
      }, 201)
    } catch (error) {
      return c.json({
        error: `Failed to configure ${type}: ${error instanceof Error ? error.message : String(error)}`,
      }, 500)
    }
  })

  app.post('/api/v1/admin/connectors/:name/sync', requireRole('admin'), requireScope('admin'), async (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const name = c.req.param('name') || ''
    try {
      const result = await ctx.forWorkspace(workspaceId).connectorManager.syncConnector(name)
      return c.json({ result })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 404)
    }
  })

  return app
}
