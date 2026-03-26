import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../../bootstrap.js'

export function chatRoutes(ctx: AppContext) {
  const app = new Hono()

  app.post('/api/v1/chat', async (c) => {
    const body = await c.req.json<{ query: string; profile?: string }>()
    if (!body.query) return c.json({ error: 'query is required' }, 400)
    const result = await ctx.ragEngine.query({ query: body.query, profile: body.profile })
    return c.json(result)
  })

  app.post('/api/v1/chat/stream', (c) => {
    const bodyPromise = c.req.json<{ query: string; profile?: string }>()
    return streamSSE(c, async (stream) => {
      const body = await bodyPromise
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
