import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'

export function documentRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/documents', (c) => c.json({ documents: ctx.store.listDocuments() }))

  app.get('/api/v1/documents/:id', (c) => {
    const doc = ctx.store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    return c.json(doc)
  })

  app.delete('/api/v1/documents/:id', async (c) => {
    const doc = ctx.store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    await ctx.store.deleteDocument(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/documents/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400)
    }
    const content = await file.text()
    const result = await ctx.pipeline.ingest({
      title: file.name,
      content,
      sourceType: 'upload',
      sourcePath: file.name,
      fileType: '.' + file.name.split('.').pop(),
    })
    return c.json(result, 201)
  })

  return app
}
