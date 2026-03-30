import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../../bootstrap.js'

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

    const workspaceId = body.workspaceId || ctx.config.workspace || 'default'

    // Build conversation history if continuing a conversation
    let conversationHistory: string | undefined
    if (body.conversationId) {
      try {
        const messages = ctx.conversationManager.getMessages(body.conversationId)
        if (messages.length > 0) {
          const recent = messages.slice(-6) // Last 3 turns (6 messages)
          conversationHistory = recent
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 500)}`)
            .join('\n')
        }
      } catch {}
    }

    const startTime = Date.now()
    const result = await ctx.ragEngine.query({ query: body.query.trim(), profile: body.profile, conversationHistory })
    const responseTimeMs = Date.now() - startTime

    // Query logging
    try {
      ctx.db.run(
        `INSERT INTO query_logs (id, workspace_id, query, intent, profile, confidence_score, response_time_ms, route, feedback, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.queryId, workspaceId, body.query, 'general', body.profile || 'balanced',
         result.confidence.score, responseTimeMs, result.route, null, new Date().toISOString()]
      )
    } catch (err) {
      console.error('[query_logs] Failed to persist:', err instanceof Error ? err.message : String(err))
    }

    // Conversation persistence
    if (body.conversationId) {
      try {
        ctx.conversationManager.addMessage(body.conversationId, 'user', body.query)
        ctx.conversationManager.addMessage(body.conversationId, 'assistant', result.answer, {
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

    // Build conversation history if continuing a conversation
    let streamConversationHistory: string | undefined
    if (body.conversationId) {
      try {
        const messages = ctx.conversationManager.getMessages(body.conversationId)
        if (messages.length > 0) {
          const recent = messages.slice(-6) // Last 3 turns (6 messages)
          streamConversationHistory = recent
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.substring(0, 500)}`)
            .join('\n')
        }
      } catch {}
    }

    return streamSSE(c, async (stream) => {
      let fullAnswer = ''
      let sources: any[] = []
      let confidence: any = null

      try {
        for await (const event of ctx.ragEngine.queryStream({ query: body.query.trim(), profile: body.profile, conversationHistory: streamConversationHistory })) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) })

          if (event.type === 'chunk') fullAnswer += event.data
          if (event.type === 'sources') sources = event.data as any[]
          if (event.type === 'confidence') confidence = event.data
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('[chat/stream] Error during streaming:', message)
        await stream.writeSSE({ event: 'error', data: JSON.stringify({ error: message }) })
      }

      // Persist conversation after streaming completes
      try {
        const conversationId = body.conversationId || ctx.conversationManager.create().id
        ctx.conversationManager.addMessage(conversationId, 'user', body.query)
        ctx.conversationManager.addMessage(conversationId, 'assistant', fullAnswer, {
          sources,
          profileUsed: body.profile || 'balanced',
          confidenceScore: confidence?.score,
        })
      } catch (err) {
        console.error('[conversation] Failed to persist:', err instanceof Error ? err.message : String(err))
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
    ctx.db.run('UPDATE query_logs SET feedback = ? WHERE id = ?', [body.feedback, body.queryId])
    return c.json({ saved: true })
  })

  return app
}
