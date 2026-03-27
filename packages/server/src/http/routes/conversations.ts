import { randomBytes } from 'node:crypto'
import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'

export function conversationRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/conversations', (c) => {
    const conversations = ctx.conversationManager.list()
    return c.json({ conversations })
  })

  app.get('/api/v1/conversations/:id/messages', (c) => {
    // Check conversation exists
    const convo = ctx.db.get('SELECT id FROM conversations WHERE id = ? AND deleted_at IS NULL', [c.req.param('id')])
    if (!convo) return c.json({ error: 'Conversation not found' }, 404)

    const messages = ctx.conversationManager.getMessages(c.req.param('id'))
    return c.json({ messages })
  })

  app.post('/api/v1/conversations', async (c) => {
    let body: { title?: string }
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }
    const conversation = ctx.conversationManager.create(body.title)
    return c.json(conversation, 201)
  })

  app.delete('/api/v1/conversations/:id', (c) => {
    ctx.conversationManager.delete(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.patch('/api/v1/conversations/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{ title?: string }>()

    const exists = ctx.db.get('SELECT id FROM conversations WHERE id = ? AND deleted_at IS NULL', [id])
    if (!exists) return c.json({ error: 'Conversation not found' }, 404)

    if (body.title !== undefined) {
      ctx.db.run('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?',
        [body.title, new Date().toISOString(), id])
    }

    return c.json({ updated: true })
  })

  app.post('/api/v1/conversations/:id/share', async (c) => {
    const id = c.req.param('id')
    const token = randomBytes(16).toString('hex')
    ctx.db.run('UPDATE conversations SET shared = 1, share_token = ? WHERE id = ?', [token, id])
    return c.json({ shareUrl: `/shared/${token}` })
  })

  app.get('/api/v1/shared/:token', async (c) => {
    const convo = ctx.db.get<any>('SELECT * FROM conversations WHERE share_token = ?', [c.req.param('token')])
    if (!convo) return c.json({ error: 'Not found' }, 404)
    const messages = ctx.conversationManager.getMessages(convo.id)
    return c.json({ conversation: convo, messages })
  })

  return app
}
