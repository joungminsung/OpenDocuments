import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { getWorkspaceServices } from '../workspace.js'

export function documentRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/documents', (c) => {
    const { store } = getWorkspaceServices(c, ctx)
    return c.json({ documents: store.listDocuments() })
  })

  // List deleted documents (trash)
  app.get('/api/v1/documents/trash', (c) => {
    const { store } = getWorkspaceServices(c, ctx)
    const docs = store.listDeletedDocuments()
    return c.json({ documents: docs })
  })

  // Restore a deleted document
  app.post('/api/v1/documents/:id/restore', (c) => {
    const { store } = getWorkspaceServices(c, ctx)
    const id = c.req.param('id')
    store.restoreDocument(id)
    return c.json({ restored: true })
  })

  app.get('/api/v1/documents/:id', (c) => {
    const { store } = getWorkspaceServices(c, ctx)
    const doc = store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    return c.json(doc)
  })

  app.delete('/api/v1/documents/:id', async (c) => {
    const { store } = getWorkspaceServices(c, ctx)
    const doc = store.getDocument(c.req.param('id'))
    if (!doc) return c.json({ error: 'Document not found' }, 404)
    await store.softDeleteDocument(c.req.param('id'))
    return c.json({ deleted: true })
  })

  app.post('/api/v1/documents/upload', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!file || !(file instanceof File)) {
      return c.json({ error: 'No file provided' }, 400)
    }

    // File size validation (50MB max)
    const MAX_FILE_SIZE = 50 * 1024 * 1024
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 50MB)` }, 413)
    }

    // Filename sanitization: strip paths and dangerous characters
    const basename = file.name.split(/[/\\]/).pop() || ''
    const sanitizedName = basename
      .replace(/\.\./g, '_')
      .replace(/[<>:"|?*]/g, '_')
      .trim()
    if (!sanitizedName || sanitizedName.length === 0) {
      return c.json({ error: 'Invalid filename' }, 400)
    }

    // Read as buffer for binary files, text for known text formats
    const textExtensions = ['.md', '.mdx', '.txt', '.json', '.yaml', '.yml', '.toml', '.csv', '.html', '.htm']
    const ext = '.' + (sanitizedName.split('.').pop() || '')
    const content = textExtensions.includes(ext)
      ? await file.text()
      : Buffer.from(await file.arrayBuffer())
    const { pipeline } = getWorkspaceServices(c, ctx)
    const result = await pipeline.ingest({
      title: sanitizedName,
      content,
      sourceType: 'upload',
      sourcePath: sanitizedName,
      fileType: sanitizedName.includes('.') ? '.' + sanitizedName.split('.').pop() : undefined,
    })
    return c.json(result, 201)
  })

  return app
}
