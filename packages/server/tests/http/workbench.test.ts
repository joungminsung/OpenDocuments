import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const stubModel = {
  provider: 'stub',
  llm: 'stub-llm',
  embedding: 'stub-embedding',
  apiKey: '',
  baseUrl: '',
  embeddingDimensions: 384,
} as any

describe('Workbench Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })
    app = createApp(ctx)
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('GET /api/v1/workbench returns a compact workspace summary', async () => {
    const workspaceId = ctx.workspaceManager.list()[0].id
    ctx.db.run(
      `INSERT INTO query_logs (id, workspace_id, query, intent, profile, confidence_score, response_time_ms, route, feedback, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['query-1', workspaceId, 'How does onboarding work?', 'general', 'balanced', 0.82, 240, 'rag', 'positive', new Date().toISOString()]
    )

    const res = await app.request('/api/v1/workbench')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.health).toMatchObject({ status: 'ok' })
    expect(body.corpus).toMatchObject({
      documents: 0,
      chunks: 0,
      sourceDistribution: {},
      statusDistribution: {},
    })
    expect(body.quality).toMatchObject({
      totalQueries: 1,
      avgConfidence: 0.82,
      avgResponseTimeMs: 240,
      feedback: { positive: 1, negative: 0 },
    })
    expect(body.connectors).toMatchObject({
      total: 0,
      active: 0,
      recent: [],
    })
    expect(body.workspace).toMatchObject({
      name: 'default',
      mode: 'personal',
    })
    expect(body.recentQueries).toEqual([
      expect.objectContaining({
        query: 'How does onboarding work?',
        confidenceScore: 0.82,
        profile: 'balanced',
      }),
    ])
    expect(body.suggestedQuestions.length).toBeGreaterThan(0)
  })
})

describe('Workbench Routes (team mode)', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { mode: 'team', model: stubModel } })
    app = createApp(ctx)
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('requires an API key in team mode', async () => {
    const res = await app.request('/api/v1/workbench')
    expect(res.status).toBe(401)
  })
})
