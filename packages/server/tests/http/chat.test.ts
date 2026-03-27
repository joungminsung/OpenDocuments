import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Chat Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    app = createApp(ctx)
  })
  afterEach(async () => { await ctx.shutdown(); rmSync(tempDir, { recursive: true, force: true }) })

  it('POST /api/v1/chat returns an answer', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Hello' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.answer).toBeDefined()
    expect(body.route).toBe('direct')
  })

  it('POST /api/v1/chat returns 400 without query', async () => {
    const res = await app.request('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/v1/chat/stream returns SSE', async () => {
    const res = await app.request('/api/v1/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Hello' }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
  })
})
