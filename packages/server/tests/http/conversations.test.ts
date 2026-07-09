import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Conversation Routes', () => {
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
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { mode: 'team', model: stubModel } })
    app = createApp(ctx)
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('requires ask scope to share conversations in team mode', async () => {
    const workspaceId = ctx.workspaceManager.list()[0].id
    const { rawKey } = ctx.apiKeyManager.create({
      name: 'reader',
      workspaceId,
      userId: 'user-1',
      role: 'viewer',
      scopes: ['document:read'],
    })
    const conversation = ctx.forWorkspace(workspaceId).conversationManager.create('Private thread')

    const res = await app.request(`/api/v1/conversations/${conversation.id}/share`, {
      method: 'POST',
      headers: { 'X-API-Key': rawKey },
    })

    expect(res.status).toBe(403)
  })
})
