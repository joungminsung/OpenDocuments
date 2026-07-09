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

describe('Health Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
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
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })
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

  it('GET /api/v1/readyz returns not_ready when model plugins are degraded', async () => {
    const res = await app.request('/api/v1/readyz')
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('not_ready')
    expect(body.checks['model:@opendocuments/stub-embedder'].status).toBe('error')
  })

  it('GET /api/v1/healthz remains a liveness check when readiness fails', async () => {
    const res = await app.request('/api/v1/healthz')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
  })

  it('GET /healthz is public for container liveness probes in team mode', async () => {
    const teamDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const teamCtx = await bootstrap({
      dataDir: teamDir,
      configOverrides: { mode: 'team', model: stubModel },
    })
    try {
      const teamApp = createApp(teamCtx)
      const res = await teamApp.request('/healthz')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    } finally {
      await teamCtx.shutdown()
      rmSync(teamDir, { recursive: true, force: true })
    }
  })

  it('uses configured CORS allowed origins', async () => {
    const secureDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const secureCtx = await bootstrap({
      dataDir: secureDir,
      configOverrides: {
        model: stubModel,
        security: {
          transport: {
            enforceHTTPS: false,
            allowedOrigins: ['https://docs.company.com'],
          },
        },
      } as any,
    })
    try {
      const secureApp = createApp(secureCtx)
      const res = await secureApp.request('/api/v1/health', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://docs.company.com',
          'Access-Control-Request-Method': 'GET',
        },
      })
      expect(res.headers.get('access-control-allow-origin')).toBe('https://docs.company.com')
    } finally {
      await secureCtx.shutdown()
      rmSync(secureDir, { recursive: true, force: true })
    }
  })

  it('enforces HTTPS for non-local team-mode API requests when configured', async () => {
    const secureDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const secureCtx = await bootstrap({
      dataDir: secureDir,
      configOverrides: {
        mode: 'team',
        model: stubModel,
        security: { transport: { enforceHTTPS: true } },
      } as any,
    })
    try {
      const secureApp = createApp(secureCtx)
      const res = await secureApp.request('/api/v1/health', {
        headers: {
          Host: 'docs.company.com',
          'X-Forwarded-Proto': 'http',
        },
      }, nodeEnv('198.51.100.7') as any)
      expect(res.status).toBe(426)
    } finally {
      await secureCtx.shutdown()
      rmSync(secureDir, { recursive: true, force: true })
    }
  })

  it('ignores spoofed HTTPS forwarding headers from untrusted clients', async () => {
    const secureDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const secureCtx = await bootstrap({
      dataDir: secureDir,
      configOverrides: {
        mode: 'team',
        model: stubModel,
        security: { transport: { enforceHTTPS: true } },
      } as any,
    })
    try {
      const secureApp = createApp(secureCtx)
      const res = await secureApp.request('/api/v1/health', {
        headers: {
          Host: 'docs.company.com',
          'X-Forwarded-Proto': 'https',
        },
      }, nodeEnv('198.51.100.7') as any)
      expect(res.status).toBe(426)
    } finally {
      await secureCtx.shutdown()
      rmSync(secureDir, { recursive: true, force: true })
    }
  })

  it('honors HTTPS forwarding headers from a configured trusted proxy', async () => {
    const secureDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const secureCtx = await bootstrap({
      dataDir: secureDir,
      configOverrides: {
        mode: 'team',
        model: stubModel,
        security: { transport: { enforceHTTPS: true, proxy: '10.0.0.1' } },
      } as any,
    })
    try {
      const { rawKey } = secureCtx.apiKeyManager.create({
        name: 'proxy-health',
        workspaceId: secureCtx.workspaceManager.list()[0].id,
        userId: 'user-1',
        role: 'admin',
      })
      const secureApp = createApp(secureCtx)
      const res = await secureApp.request('/api/v1/health', {
        headers: {
          Host: 'docs.company.com',
          'X-Forwarded-Proto': 'https',
          'X-API-Key': rawKey,
        },
      }, nodeEnv('10.0.0.1') as any)
      expect(res.status).toBe(200)
    } finally {
      await secureCtx.shutdown()
      rmSync(secureDir, { recursive: true, force: true })
    }
  })

  it('restricts widget script by configured referer domains', async () => {
    const widgetDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const widgetCtx = await bootstrap({
      dataDir: widgetDir,
      configOverrides: {
        model: stubModel,
        security: {
          transport: {
            widgetAllowedDomains: ['https://docs.company.com'],
          },
        },
      } as any,
    })
    try {
      const widgetApp = createApp(widgetCtx)
      const blocked = await widgetApp.request('/widget.js', {
        headers: { Referer: 'https://evil.example/page' },
      })
      const allowed = await widgetApp.request('/widget.js', {
        headers: { Referer: 'https://docs.company.com/page' },
      })
      expect(blocked.status).toBe(403)
      expect(allowed.status).toBe(200)
    } finally {
      await widgetCtx.shutdown()
      rmSync(widgetDir, { recursive: true, force: true })
    }
  })
})
