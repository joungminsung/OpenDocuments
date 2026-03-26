import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'

export function documentRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/documents', (c) => c.json({ documents: ctx.store.listDocuments() }))

  // List deleted documents (trash)
  app.get('/api/v1/documents/trash', (c) => {
    const docs = ctx.store.listDeletedDocuments()
    return c.json({ documents: docs })
  })

  // Restore a deleted document
  app.post('/api/v1/documents/:id/restore', (c) => {
    const id = c.req.param('id')
    ctx.store.restoreDocument(id)
    return c.json({ restored: true })
  })

  app.get('/api/v1/documents/:id', (c) => {
    const doc = ctx.store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    return c.json(doc)
  })

  app.delete('/api/v1/documents/:id', async (c) => {
    const doc = ctx.store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    await ctx.store.softDeleteDocument(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/documents/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400)
    }
    // Read as buffer for binary files, text for known text formats
    const textExtensions = ['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml', '.csv', '.html', '.htm']
    const ext = '.' + (file.name.split('.').pop() || '')
    const content = textExtensions.includes(ext)
      ? await file.text()
      : Buffer.from(await file.arrayBuffer())
    const result = await ctx.pipeline.ingest({
      title: file.name,
      content,
      sourceType: 'upload',
      sourcePath: file.name,
      fileType: file.name.includes('.') ? '.' + file.name.split('.').pop() : undefined,
    })
    return c.json(result, 201)
  })

  return app
}
