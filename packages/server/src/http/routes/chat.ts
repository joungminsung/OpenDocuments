import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../../bootstrap.js'

export function chatRoutes(ctx: AppContext) {
  const app = new Hono()

  app.post('/api/v1/chat', async (c) => {
    let body: { query: string; profile?: string; conversationId?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    if (!body.query) return c.json({ error: 'query is required' }, 400)

    const startTime = Date.now()
    const result = await ctx.ragEngine.query({ query: body.query, profile: body.profile })
    const responseTimeMs = Date.now() - startTime

    // Query logging (Fix 8) -- write to query_logs table
    try {
      ctx.db.run(
        `INSERT INTO query_logs (id, workspace_id, query, intent, profile, confidence_score, response_time_ms, route, feedback, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [result.queryId, 'default', body.query, 'general', body.profile || 'balanced',
         result.confidence.score, responseTimeMs, result.route, null, new Date().toISOString()]
      )
    } catch {} // Don't fail the response if logging fails

    // Conversation persistence -- optionally save messages
    if (body.conversationId) {
      try {
        ctx.conversationManager.addMessage(body.conversationId, 'user', body.query)
        ctx.conversationManager.addMessage(body.conversationId, 'assistant', result.answer, {
          sources: result.sources,
          profileUsed: result.profile,
          confidenceScore: result.confidence.score,
          responseTimeMs,
        })
      } catch {} // Don't fail the response if saving fails
    }

    return c.json(result)
  })

  app.post('/api/v1/chat/stream', async (c) => {
    let body: { query: string; profile?: string; conversationId?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    if (!body.query) return c.json({ error: 'query is required' }, 400)

    return streamSSE(c, async (stream) => {
      let fullAnswer = ''
      let sources: any[] = []
      let confidence: any = null

      for await (const event of ctx.ragEngine.queryStream({ query: body.query, profile: body.profile })) {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) })

        if (event.type === 'chunk') fullAnswer += event.data
        if (event.type === 'sources') sources = event.data as any[]
        if (event.type === 'confidence') confidence = event.data
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
      } catch {} // Don't fail the response if persistence fails
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
