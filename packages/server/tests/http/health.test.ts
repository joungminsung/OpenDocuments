import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Health Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    app = createApp(ctx)
  })
  afterEach(async () => { await ctx.shutdown(); rmSync(tempDir, { recursive: true, force: true }) })

  it('GET /api/v1/health returns ok', async () => {
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('GET /api/v1/stats returns counts', async () => {
    const res = await app.request('/api/v1/stats')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toBe(0)
    expect(body.workspaces).toBe(1)
    expect(body.plugins).toBeGreaterThan(0)
  })
})
