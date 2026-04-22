import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { getWorkspaceServices } from '../workspace.js'

export function collectionRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/collections', (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    return c.json({ collections: collectionManager.list() })
  })

  app.post('/api/v1/collections', async (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    const body = await c.req.json<{ name: string; description?: string }>()
    return c.json(collectionManager.create(body.name, body.description), 201)
  })

  app.delete('/api/v1/collections/:id', (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    collectionManager.delete(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/collections/:id/documents/:docId', (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    collectionManager.addDocument(c.req.param('id'), c.req.param('docId'))
    return c.json({ added: true })
  })

  return app
}
