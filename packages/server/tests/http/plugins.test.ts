import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync, execSync } from 'node:child_process'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => '[]'),
  execFileSync: vi.fn(() => '[]'),
}))

describe('Plugin Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string
  let adminKey: string
  let memberKey: string
  const stubModel = {
    provider: 'stub',
    llm: 'stub-llm',
    embedding: 'stub-embedding',
    apiKey: '',
    baseUrl: '',
    embeddingDimensions: 384,
  } as any

  beforeEach(async () => {
    vi.clearAllMocks()
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { mode: 'team', model: stubModel } })
    app = createApp(ctx)

    adminKey = ctx.apiKeyManager.create({
      name: 'admin-key',
      workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'admin-1',
      role: 'admin',
    }).rawKey

    memberKey = ctx.apiKeyManager.create({
      name: 'member-key',
      workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'member-1',
      role: 'member',
    }).rawKey
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('rejects plugin installation for non-admin users', async () => {
    const res = await app.request('/api/v1/plugins/install', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': memberKey,
      },
      body: JSON.stringify({ name: 'opendocuments-parser-pdf' }),
    })

    expect(res.status).toBe(403)
    expect(execSync).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('rejects invalid plugin names before invoking npm', async () => {
    const res = await app.request('/api/v1/plugins/install', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': adminKey,
      },
      body: JSON.stringify({ name: 'opendocuments-parser-pdf;touch /tmp/pwned' }),
    })

    expect(res.status).toBe(400)
    expect(execSync).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('rejects invalid plugin names on uninstall before invoking npm', async () => {
    const res = await app.request('/api/v1/plugins/opendocuments-parser-pdf%3Btouch%20%2Ftmp%2Fpwned', {
      method: 'DELETE',
      headers: {
        'X-API-Key': adminKey,
      },
    })

    expect(res.status).toBe(400)
    expect(execSync).not.toHaveBeenCalled()
    expect(execFileSync).not.toHaveBeenCalled()
  })

  it('searches plugins with argument arrays instead of a shell command', async () => {
    const query = 'foo;touch /tmp/pwned'
    const res = await app.request(`/api/v1/plugins/search?q=${encodeURIComponent(query)}`, {
      headers: {
        'X-API-Key': adminKey,
      },
    })

    expect(res.status).toBe(200)
    expect(execSync).not.toHaveBeenCalled()
    expect(execFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/^npm(?:\.cmd)?$/),
      ['search', 'opendocuments', query, '--json'],
      expect.objectContaining({ encoding: 'utf-8', timeout: 30000 })
    )
  })
})
