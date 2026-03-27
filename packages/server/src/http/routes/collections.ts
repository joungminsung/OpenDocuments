import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { CollectionManager } from '@opendocuments/core'

export function collectionRoutes(ctx: AppContext) {
  const app = new Hono()
  const wsId = ctx.workspaceManager.list()[0]?.id || 'default'
  const collectionManager = new CollectionManager(ctx.db, wsId)

  app.get('/api/v1/collections', (c) => c.json({ collections: collectionManager.list() }))

  app.post('/api/v1/collections', async (c) => {
    const body = await c.req.json<{ name: string; description?: string }>()
    return c.json(collectionManager.create(body.name, body.description), 201)
  })

  app.delete('/api/v1/collections/:id', (c) => {
    collectionManager.delete(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/collections/:id/documents/:docId', (c) => {
    collectionManager.addDocument(c.req.param('id'), c.req.param('docId'))
    return c.json({ added: true })
  })

  return app
}
