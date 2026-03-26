import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../../bootstrap.js'

export function chatRoutes(ctx: AppContext) {
  const app = new Hono()

  app.post('/api/v1/chat', async (c) => {
    let body: { query: string; profile?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    if (!body.query) return c.json({ error: 'query is required' }, 400)
    const result = await ctx.ragEngine.query({ query: body.query, profile: body.profile })
    return c.json(result)
  })

  app.post('/api/v1/chat/stream', async (c) => {
    let body: { query: string; profile?: string }
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }
    return streamSSE(c, async (stream) => {
      if (!body.query) {
        await stream.writeSSE({ data: JSON.stringify({ type: 'error', data: 'query is required' }) })
        return
      }
      for await (const event of ctx.ragEngine.queryStream({ query: body.query, profile: body.profile })) {
        await stream.writeSSE({ event: event.type, data: JSON.stringify(event.data) })
      }
    })
  })

  return app
}
