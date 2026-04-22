import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { getWorkspaceServices } from '../workspace.js'

export function tagRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/tags', (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    return c.json({ tags: tagManager.list() })
  })

  app.post('/api/v1/tags', async (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    const body = await c.req.json<{ name: string; color?: string }>()
    const tag = tagManager.create(body.name, body.color)
    return c.json(tag, 201)
  })

  app.delete('/api/v1/tags/:id', (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    tagManager.delete(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/documents/:docId/tags/:tagId', (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    tagManager.tagDocument(c.req.param('docId'), c.req.param('tagId'))
    return c.json({ tagged: true })
  })

  app.delete('/api/v1/documents/:docId/tags/:tagId', (c) => {
    const { tagManager } = getWorkspaceServices(c, ctx)
    tagManager.untagDocument(c.req.param('docId'), c.req.param('tagId'))
    return c.json({ untagged: true })
  })

  return app
}
