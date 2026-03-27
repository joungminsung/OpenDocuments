import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { CollectionManager } from '@opendocs/core'

export function collectionRoutes(ctx: AppContext) {
  const app = new Hono()
  const getMgr = () => new CollectionManager(ctx.db, ctx.workspaceManager.list()[0]?.id || 'default')

  app.get('/api/v1/collections', (c) => c.json({ collections: getMgr().list() }))

  app.post('/api/v1/collections', async (c) => {
    const body = await c.req.json<{ name: string; description?: string }>()
    return c.json(getMgr().create(body.name, body.description), 201)
  })

  app.delete('/api/v1/collections/:id', (c) => {
    getMgr().delete(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/collections/:id/documents/:docId', (c) => {
    getMgr().addDocument(c.req.param('id'), c.req.param('docId'))
    return c.json({ added: true })
  })

  return app
}
