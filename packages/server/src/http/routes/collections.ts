import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { getWorkspaceServices } from '../workspace.js'
import { requireScope } from '../middleware/auth.js'

export function collectionRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/collections', (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    return c.json({ collections: collectionManager.list() })
  })

  app.get('/api/v1/collections/:id/documents', (c) => {
    const { collectionManager, store } = getWorkspaceServices(c, ctx)
    const collectionId = c.req.param('id')
    const collection = collectionManager.list().find((item) => item.id === collectionId)
    if (!collection) return c.json({ error: 'Collection not found' }, 404)

    const documentIds = new Set(collectionManager.getDocuments(collectionId))
    const documents = store.listDocuments().filter((document) => documentIds.has(document.id))
    return c.json({ collection, documents })
  })

  app.post('/api/v1/collections', requireScope('document:write'), async (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    const body = await c.req.json<{ name: string; description?: string }>()
    const name = body.name?.trim()
    if (!name) return c.json({ error: 'Collection name required' }, 400)
    return c.json(collectionManager.create(name, body.description?.trim() || undefined), 201)
  })

  app.delete('/api/v1/collections/:id', requireScope('document:write'), (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    const collectionId = c.req.param('id')
    if (!collectionId) return c.json({ error: 'Collection id required' }, 400)
    collectionManager.delete(collectionId)
    return c.json({ deleted: true })
  })

  app.post('/api/v1/collections/:id/documents/:docId', requireScope('document:write'), (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    const collectionId = c.req.param('id')
    const documentId = c.req.param('docId')
    if (!collectionId || !documentId) return c.json({ error: 'Collection and document ids required' }, 400)
    collectionManager.addDocument(collectionId, documentId)
    return c.json({ added: true })
  })

  app.delete('/api/v1/collections/:id/documents/:docId', requireScope('document:write'), (c) => {
    const { collectionManager } = getWorkspaceServices(c, ctx)
    const collectionId = c.req.param('id')
    const documentId = c.req.param('docId')
    if (!collectionId || !documentId) return c.json({ error: 'Collection and document ids required' }, 400)
    collectionManager.removeDocument(collectionId, documentId)
    return c.json({ removed: true })
  })

  return app
}
