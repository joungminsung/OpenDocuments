import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { getWorkspaceServices } from '../workspace.js'
import { requireScope } from '../middleware/auth.js'

export function tagRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/tags', requireScope('document:read'), (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    return c.json({ tags: tagManager.list() })
  })

  app.post('/api/v1/tags', requireScope('document:write'), async (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    const body = await c.req.json<{ name: string; color?: string }>()
    const tag = tagManager.create(body.name, body.color)
    return c.json(tag, 201)
  })

  app.delete('/api/v1/tags/:id', requireScope('document:write'), (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    const id = c.req.param('id')
    if (!id) return c.json({ error: 'Tag id required' }, 400)
    tagManager.delete(id)
    return c.json({ deleted: true })
  })

  app.post('/api/v1/documents/:docId/tags/:tagId', requireScope('document:write'), (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    const documentId = c.req.param('docId')
    const tagId = c.req.param('tagId')
    if (!documentId || !tagId) return c.json({ error: 'Document and tag ids required' }, 400)
    tagManager.tagDocument(documentId, tagId)
    return c.json({ tagged: true })
  })

  app.delete('/api/v1/documents/:docId/tags/:tagId', requireScope('document:write'), (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    const documentId = c.req.param('docId')
    const tagId = c.req.param('tagId')
    if (!documentId || !tagId) return c.json({ error: 'Document and tag ids required' }, 400)
    tagManager.untagDocument(documentId, tagId)
    return c.json({ untagged: true })
  })

  return app
}
