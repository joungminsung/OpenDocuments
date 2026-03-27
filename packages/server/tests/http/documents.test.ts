import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Document Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    app = createApp(ctx)
  })
  afterEach(async () => { await ctx.shutdown(); rmSync(tempDir, { recursive: true, force: true }) })

  it('GET /api/v1/documents returns empty list', async () => {
    const res = await app.request('/api/v1/documents')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toEqual([])
  })

  it('POST /api/v1/documents/upload indexes a file', async () => {
    const formData = new FormData()
    formData.append('file', new File(['# Hello\n\nWorld'], 'test.md', { type: 'text/markdown' }))
    const res = await app.request('/api/v1/documents/upload', { method: 'POST', body: formData })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('indexed')
  })

  it('GET /api/v1/documents/:id returns 404 for missing', async () => {
    const res = await app.request('/api/v1/documents/nonexistent')
    expect(res.status).toBe(404)
  })
})
