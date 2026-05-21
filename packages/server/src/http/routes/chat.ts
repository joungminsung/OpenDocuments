import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../../bootstrap.js'
import { getWorkspaceServices, resolveRequestWorkspaceId } from '../workspace.js'

function persistQueryLog(
  ctx: AppContext,
  params: {
    queryId: string
    workspaceId: string
    query: string
    profile: string
    confidenceScore: number | null | undefined
    responseTimeMs: number
    route: string
  }
) {
  try {
    ctx.db.run(
      `INSERT INTO query_logs (id, workspace_id, query, intent, profile, confidence_score, response_time_ms, route, feedback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.queryId,
        params.workspaceId,
        params.query,
        'general',
        params.profile,
        params.confidenceScore ?? null,
        params.responseTimeMs,
        params.route,
        null,
        new Date().toISOString(),
      ]
    )
  } catch (err) {
    console.error('[query_logs] Failed to persist:', err instanceof Error ? err.message : String(err))
  }
}

function getConversationHistory(
  conversationManager: ReturnType<AppContext['forWorkspace']>['conversationManager'],
  conversationId: string
): string | undefined {
  const messages = conversationManager.getMessages(conversationId)
  if (messages.length === 0) return undefined

  const recent = messages.slice(-6)
  return recent
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content.substring(0, 500)}`)
    .join('\n')
}

export function chatRoutes(ctx: AppContext) {
  const app = new Hono()

  app.post('/api/v1/chat', async (c) => {
    let body: { query: string; profile?: string; conversationId?: string; workspaceId?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    if (!body.query || !body.query.trim()) return c.json({ error: 'query is required and must not be empty' }, 400)

    const workspaceId = resolveRequestWorkspaceId(c, ctx, body.workspaceId)
    const { conversationManager } = getWorkspaceServices(c, ctx, body.workspaceId)

    let conversationHistory: string | undefined
    if (body.conversationId) {
      const convo = ctx.db.get(
        'SELECT id FROM conversations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
        [body.conversationId, workspaceId]
      )
      if (!convo) return c.json({ error: 'Conversation not found' }, 404)
      conversationHistory = getConversationHistory(conversationManager, body.conversationId)
    }

    const startTime = Date.now()
    const result = await ctx.ragEngine.query({ query: body.query.trim(), profile: body.profile, conversationHistory })
    const responseTimeMs = Date.now() - startTime

    persistQueryLog(ctx, {
      queryId: result.queryId,
      workspaceId,
      query: body.query,
      profile: body.profile || 'balanced',
      confidenceScore: result.confidence.score,
      responseTimeMs,
      route: result.route,
    })

    if (body.conversationId) {
      try {
        conversationManager.addMessage(body.conversationId, 'user', body.query)
        conversationManager.addMessage(body.conversationId, 'assistant', result.answer, {
          sources: result.sources,
          profileUsed: result.profile,
          confidenceScore: result.confidence.score,
          responseTimeMs,
        })
      } catch (err) {
        console.error('[conversation] Failed to persist:', err instanceof Error ? err.message : String(err))
      }
    }

    return c.json(result)
  })

  app.post('/api/v1/chat/stream', async (c) => {
    let body: { query: string; profile?: string; conversationId?: string; workspaceId?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    if (!body.query || !body.query.trim()) return c.json({ error: 'query is required and must not be empty' }, 400)

    const workspaceId = resolveRequestWorkspaceId(c, ctx, body.workspaceId)
    const { conversationManager } = getWorkspaceServices(c, ctx, body.workspaceId)

    let streamConversationHistory: string | undefined
    if (body.conversationId) {
      const convo = ctx.db.get(
        'SELECT id FROM conversations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
        [body.conversationId, workspaceId]
      )
      if (!convo) return c.json({ error: 'Conversation not found' }, 404)
      streamConversationHistory = getConversationHistory(conversationManager, body.conversationId)
    }

    return streamSSE(c, async (stream) => {
      const startTime = Date.now()
      let fullAnswer = ''
      let sources: any[] = []
      let confidence: any = null
      let streamError = false
      let queryId: string | null = null
      let route = 'unknown'
      let profileUsed = body.profile || 'balanced'

      try {
        for await (const event of ctx.ragEngine.queryStream({
          query: body.query.trim(),
          profile: body.profile,
          conversationHistory: streamConversationHistory,
        })) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) })

          if (event.type === 'chunk') fullAnswer += event.data
          if (event.type === 'sources') sources = event.data as any[]
          if (event.type === 'confidence') confidence = event.data
          if (event.type === 'done') {
            queryId = event.data.queryId
            route = event.data.route
            profileUsed = event.data.profile
          }
        }
      } catch (err) {
        streamError = true
        const internalMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error('[chat/stream] Error during streaming:', internalMessage)
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: 'An error occurred while processing your request' }) })
      }

      if (!streamError && fullAnswer) {
        try {
          const conversationId = body.conversationId || conversationManager.create().id
          conversationManager.addMessage(conversationId, 'user', body.query)
          conversationManager.addMessage(conversationId, 'assistant', fullAnswer, {
            sources,
            profileUsed,
            confidenceScore: confidence?.score,
          })

          if (queryId) {
            persistQueryLog(ctx, {
              queryId,
              workspaceId,
              query: body.query,
              profile: profileUsed,
              confidenceScore: confidence?.score,
              responseTimeMs: Date.now() - startTime,
              route,
            })
          }
        } catch (err) {
          console.error('[conversation] Failed to persist:', err instanceof Error ? err.message : String(err))
        }
      }
    })
  })

  app.post('/api/v1/chat/feedback', async (c) => {
    let body: { queryId: string; feedback: 'positive' | 'negative' }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    if (!body.queryId || !body.feedback) return c.json({ error: 'queryId and feedback are required' }, 400)
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    ctx.db.run(
      'UPDATE query_logs SET feedback = ? WHERE id = ? AND workspace_id = ?',
      [body.feedback, body.queryId, workspaceId]
    )
    return c.json({ saved: true })
  })

  return app
}
