import { randomBytes } from 'node:crypto'
import { Hono, type Context } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { getWorkspaceServices, resolveRequestWorkspaceId } from '../workspace.js'

export function getSharedConversationHandler(ctx: AppContext) {
  return async (c: Context) => {
    const convo = ctx.db.get<any>('SELECT * FROM conversations WHERE share_token = ?', [c.req.param('token')])
    if (!convo) return c.json({ error: 'Not found' }, 404)
    const { conversationManager } = ctx.forWorkspace(convo.workspace_id)
    const messages = conversationManager.getMessages(convo.id)
    return c.json({ conversation: convo, messages })
  }
}

export function conversationRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/conversations', (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const limit = Math.min(Math.max(parseInt(c.req.query('limit') || '50', 10) || 50, 1), 200)
    const offset = Math.max(parseInt(c.req.query('offset') || '0', 10) || 0, 0)
    const conversations = ctx.db.all<any>(
      'SELECT * FROM conversations WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ? OFFSET ?',
      [workspaceId, limit, offset]
    )
    return c.json({ conversations, limit, offset })
  })

  app.get('/api/v1/conversations/:id/messages', (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const convo = ctx.db.get(
      'SELECT id FROM conversations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
      [c.req.param('id'), workspaceId]
    )
    if (!convo) return c.json({ error: 'Conversation not found' }, 404)

    const { conversationManager } = getWorkspaceServices(c, ctx)
    const messages = conversationManager.getMessages(c.req.param('id'))
    return c.json({ messages })
  })

  app.post('/api/v1/conversations', async (c) => {
    let body: { title?: string }
    try {
      body = await c.req.json()
    } catch {
      body = {}
    }
    const { conversationManager } = getWorkspaceServices(c, ctx)
    const conversation = conversationManager.create(body.title)
    return c.json(conversation, 201)
  })

  app.delete('/api/v1/conversations/:id', (c) => {
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const convo = ctx.db.get<any>(
      'SELECT workspace_id FROM conversations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
      [c.req.param('id'), workspaceId]
    )
    if (!convo) return c.json({ error: 'Conversation not found' }, 404)

    const { conversationManager } = getWorkspaceServices(c, ctx)
    conversationManager.delete(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.patch('/api/v1/conversations/:id', async (c) => {
    const id = c.req.param('id')
    const body = await c.req.json<{ title?: string }>()
    const workspaceId = resolveRequestWorkspaceId(c, ctx)

    const exists = ctx.db.get(
      'SELECT id FROM conversations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
      [id, workspaceId]
    )
    if (!exists) return c.json({ error: 'Conversation not found' }, 404)

    if (body.title !== undefined) {
      ctx.db.run(
        'UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND workspace_id = ?',
        [body.title, new Date().toISOString(), id, workspaceId]
      )
    }

    return c.json({ updated: true })
  })

  app.post('/api/v1/conversations/:id/share', async (c) => {
    const id = c.req.param('id')
    const workspaceId = resolveRequestWorkspaceId(c, ctx)
    const convo = ctx.db.get<any>(
      'SELECT * FROM conversations WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL',
      [id, workspaceId]
    )
    if (!convo) return c.json({ error: 'Conversation not found' }, 404)

    const token = randomBytes(16).toString('hex')
    ctx.db.run(
      'UPDATE conversations SET shared = 1, share_token = ? WHERE id = ? AND workspace_id = ?',
      [token, id, workspaceId]
    )
    return c.json({ shareUrl: `/shared/${token}` })
  })

  return app
}
