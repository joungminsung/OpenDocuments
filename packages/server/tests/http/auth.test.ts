import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function nodeEnv(remoteAddress: string) {
  return {
    server: {
      incoming: {
        socket: {
          remoteAddress,
          remotePort: 12345,
          remoteFamily: remoteAddress.includes(':') ? 'IPv6' : 'IPv4',
        },
      },
    },
  }
}

describe('Auth Middleware', () => {
  let ctx: AppContext
  let tempDir: string
  const stubModel = {
    provider: 'stub',
    llm: 'stub-llm',
    embedding: 'stub-embedding',
    apiKey: '',
    baseUrl: '',
    embeddingDimensions: 384,
  } as any

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    // Bootstrap in team mode
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { mode: 'team', model: stubModel } })
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('rejects requests without API key in team mode', async () => {
    const app = createApp(ctx)
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(401)
  })

  it('accepts requests with valid API key', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'test', workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1', role: 'admin',
    })
    const app = createApp(ctx)
    const res = await app.request('/api/v1/health', {
      headers: { 'X-API-Key': rawKey },
    })
    expect(res.status).toBe(200)
  })

  it('accepts requests with a session cookie', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'cookie-test', workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1', role: 'admin',
    })
    const app = createApp(ctx)
    const res = await app.request('/api/v1/health', {
      headers: { Cookie: `opendocuments_session=${rawKey}` },
    })
    expect(res.status).toBe(200)
  })

  it('enforces API key IP restrictions', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'ip-test',
      workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1',
      role: 'admin',
      allowedIps: ['203.0.113.10'],
    })
    ctx.config.security.transport.proxy = '10.0.0.1'
    const app = createApp(ctx)

    const blocked = await app.request('/api/v1/health', {
      headers: {
        'X-API-Key': rawKey,
        'X-Forwarded-For': '198.51.100.7',
        'X-Forwarded-Proto': 'https',
      },
    }, nodeEnv('10.0.0.1') as any)
    const allowed = await app.request('/api/v1/health', {
      headers: {
        'X-API-Key': rawKey,
        'X-Forwarded-For': '203.0.113.10, 10.0.0.1',
        'X-Forwarded-Proto': 'https',
      },
    }, nodeEnv('10.0.0.1') as any)

    expect(blocked.status).toBe(403)
    expect(allowed.status).toBe(200)
  })

  it('ignores spoofed forwarding headers from untrusted clients', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'ip-spoof-test',
      workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1',
      role: 'admin',
      allowedIps: ['203.0.113.10'],
    })
    const app = createApp(ctx)

    const res = await app.request('https://docs.company.com/api/v1/health', {
      headers: {
        'X-API-Key': rawKey,
        'X-Forwarded-For': '203.0.113.10',
      },
    }, nodeEnv('198.51.100.7') as any)

    expect(res.status).toBe(403)
  })

  it('rejects expired API key', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'expired', workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1', role: 'member', expiresAt: '2020-01-01T00:00:00Z',
    })
    const app = createApp(ctx)
    const res = await app.request('/api/v1/health', {
      headers: { 'X-API-Key': rawKey },
    })
    expect(res.status).toBe(401)
  })

  it('allows all requests in personal mode', async () => {
    const tempDir2 = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const personalCtx = await bootstrap({ dataDir: tempDir2, configOverrides: { model: stubModel } })  // default personal mode
    const app = createApp(personalCtx)
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    await personalCtx.shutdown()
    rmSync(tempDir2, { recursive: true, force: true })
  })

  it('returns 429 when rate limit exceeded', async () => {
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'test', workspaceId: ctx.workspaceManager.list()[0].id,
      userId: 'user-1', role: 'admin',
    })
    const app = createApp(ctx)

    // Make many requests quickly
    for (let i = 0; i < 61; i++) {
      await app.request('/api/v1/health', { headers: { 'X-API-Key': rawKey } })
    }
    const res = await app.request('/api/v1/health', { headers: { 'X-API-Key': rawKey } })
    expect(res.status).toBe(429)
  })
})
