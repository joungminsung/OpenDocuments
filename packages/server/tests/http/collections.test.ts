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

describe('Collection Routes', () => {
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

  it('creates a collection and returns its assigned documents', async () => {
    const formData = new FormData()
    formData.append('file', new File(['# Handbook\n\nUse cited answers.'], 'handbook.md', { type: 'text/markdown' }))
    const upload = await app.request('/api/v1/documents/upload', { method: 'POST', body: formData })
    expect(upload.status).toBe(201)
    const uploaded = await upload.json()

    const create = await app.request('/api/v1/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Policies', description: 'Operational policies' }),
    })
    expect(create.status).toBe(201)
    const collection = await create.json()

    const add = await app.request(`/api/v1/collections/${collection.id}/documents/${uploaded.documentId}`, { method: 'POST' })
    expect(add.status).toBe(200)

    const detail = await app.request(`/api/v1/collections/${collection.id}/documents`)
    expect(detail.status).toBe(200)
    const body = await detail.json()
    expect(body.collection).toMatchObject({ id: collection.id, name: 'Policies' })
    expect(body.documents).toEqual([
      expect.objectContaining({
        id: uploaded.documentId,
        title: 'handbook.md',
        status: 'indexed',
      }),
    ])
  })

  it('rejects empty collection names', async () => {
    const res = await app.request('/api/v1/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    })
    expect(res.status).toBe(400)
  })

  it('requires document:write scope for collection mutations in team mode', async () => {
    const teamDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    const teamCtx = await bootstrap({
      dataDir: teamDir,
      configOverrides: { mode: 'team', model: stubModel },
    })
    try {
      const workspaceId = teamCtx.workspaceManager.list()[0].id
      const viewer = teamCtx.apiKeyManager.create({
        name: 'viewer', workspaceId, userId: 'viewer-1', role: 'viewer',
      })
      const member = teamCtx.apiKeyManager.create({
        name: 'member', workspaceId, userId: 'member-1', role: 'member',
      })
      const teamApp = createApp(teamCtx)
      const body = JSON.stringify({ name: 'Restricted collection' })

      const blocked = await teamApp.request('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': viewer.rawKey },
        body,
      })
      const allowed = await teamApp.request('/api/v1/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': member.rawKey },
        body,
      })

      expect(blocked.status).toBe(403)
      expect(allowed.status).toBe(201)
    } finally {
      await teamCtx.shutdown()
      rmSync(teamDir, { recursive: true, force: true })
    }
  })
})
