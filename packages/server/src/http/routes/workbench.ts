import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { SERVER_VERSION } from '../../version.js'
import { resolveRequestWorkspaceId } from '../workspace.js'

interface DocumentSummaryRow extends Record<string, unknown> {
  docCount: number
  chunkCount: number
}

interface DistributionRow extends Record<string, unknown> {
  key: string
  count: number
}

interface QualitySummaryRow extends Record<string, unknown> {
  totalQueries: number
  avgConfidence: number | null
  avgResponseTime: number | null
}

interface FeedbackRow extends Record<string, unknown> {
  positive: number | null
  negative: number | null
}

interface RecentQueryRow extends Record<string, unknown> {
  query: string
  profile: string
  confidence_score: number | null
  response_time_ms: number | null
  route: string | null
  created_at: string
}

function toDistribution(rows: DistributionRow[]): Record<string, number> {
  const distribution: Record<string, number> = {}
  for (const row of rows) {
    distribution[row.key || 'unknown'] = row.count
  }
  return distribution
}

function suggestedQuestions(documentCount: number): string[] {
  if (documentCount === 0) {
    return [
      'What should I upload first?',
      'How do I connect a documentation source?',
      'What can OpenDocuments answer once documents are indexed?',
    ]
  }

  return [
    'Summarize the most important docs in this workspace.',
    'Which source explains the current deployment process?',
    'Find policy or architecture notes related to authentication.',
  ]
}

export function workbenchRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/workbench', (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)

    const documentSummary = ctx.db.get<DocumentSummaryRow>(
      'SELECT COUNT(*) as docCount, COALESCE(SUM(chunk_count), 0) as chunkCount FROM documents WHERE deleted_at IS NULL AND workspace_id = ?',
      [workspaceId]
    )

    const sourceDistribution = toDistribution(ctx.db.all<DistributionRow>(
      'SELECT source_type as key, COUNT(*) as count FROM documents WHERE deleted_at IS NULL AND workspace_id = ? GROUP BY source_type',
      [workspaceId]
    ))

    const statusDistribution = toDistribution(ctx.db.all<DistributionRow>(
      'SELECT status as key, COUNT(*) as count FROM documents WHERE deleted_at IS NULL AND workspace_id = ? GROUP BY status',
      [workspaceId]
    ))

    const quality = ctx.db.get<QualitySummaryRow>(
      'SELECT COUNT(*) as totalQueries, AVG(confidence_score) as avgConfidence, AVG(response_time_ms) as avgResponseTime FROM query_logs WHERE workspace_id = ?',
      [workspaceId]
    )

    const feedback = ctx.db.get<FeedbackRow>(
      `SELECT
        SUM(CASE WHEN feedback = 'positive' THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN feedback = 'negative' THEN 1 ELSE 0 END) as negative
       FROM query_logs WHERE feedback IS NOT NULL AND workspace_id = ?`,
      [workspaceId]
    )

    const recentQueries = ctx.db.all<RecentQueryRow>(
      `SELECT query, profile, confidence_score, response_time_ms, route, created_at
       FROM query_logs
       WHERE workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 6`,
      [workspaceId]
    ).map((row) => ({
      query: row.query,
      profile: row.profile,
      confidenceScore: row.confidence_score,
      responseTimeMs: row.response_time_ms,
      route: row.route,
      createdAt: row.created_at,
    }))

    const connectors = ctx.forWorkspace(workspaceId).connectorManager.listConnectors()
    const workspace = ctx.workspaceManager.getById(workspaceId)
    const activeConnectors = connectors.filter((connector) => connector.status === 'active').length
    const modelCount = ctx.registry.getModels().length
    const stubModelCount = ctx.registry.getModels().filter((model) => model.name.includes('stub')).length
    const docCount = documentSummary?.docCount || 0

    return c.json({
      health: {
        status: 'ok',
        version: SERVER_VERSION,
        modelStatus: stubModelCount > 0 ? 'degraded' : 'ready',
        models: modelCount,
      },
      corpus: {
        documents: docCount,
        chunks: documentSummary?.chunkCount || 0,
        sourceDistribution,
        statusDistribution,
      },
      quality: {
        totalQueries: quality?.totalQueries || 0,
        avgConfidence: Math.round((quality?.avgConfidence || 0) * 100) / 100,
        avgResponseTimeMs: Math.round(quality?.avgResponseTime || 0),
        feedback: {
          positive: feedback?.positive || 0,
          negative: feedback?.negative || 0,
        },
      },
      connectors: {
        total: connectors.length,
        active: activeConnectors,
        recent: connectors.slice(0, 4).map((connector) => ({
          name: connector.name,
          type: connector.type,
          status: connector.status,
          lastSyncedAt: connector.lastSyncedAt,
          repo: connector.repo,
        })),
      },
      workspace: {
        name: workspace?.name || 'default',
        mode: workspace?.mode || ctx.config.mode,
      },
      recentQueries,
      suggestedQuestions: suggestedQuestions(docCount),
    })
  })

  return app
}
