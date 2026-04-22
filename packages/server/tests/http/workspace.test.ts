import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../../src/bootstrap.js'
import { createApp } from '../../src/http/app.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Workspace-scoped Routes', () => {
  let ctx: AppContext
  let app: ReturnType<typeof createApp>
  let tempDir: string
  let defaultAdminKey: string
  let secondaryWorkspaceId: string
  let secondaryAdminKey: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({
      dataDir: tempDir,
      configOverrides: {
        mode: 'team',
        model: {
          provider: 'stub',
          llm: 'stub-llm',
          embedding: 'stub-embedding',
          apiKey: '',
          baseUrl: '',
          embeddingDimensions: 384,
        } as any,
      },
    })
    app = createApp(ctx)

    const defaultWorkspace = ctx.workspaceManager.list()[0]
    const secondaryWorkspace = ctx.workspaceManager.create('secondary', 'team')
    secondaryWorkspaceId = secondaryWorkspace.id

    defaultAdminKey = ctx.apiKeyManager.create({
      name: 'default-admin',
      workspaceId: defaultWorkspace.id,
      userId: 'default-admin',
      role: 'admin',
    }).rawKey

    secondaryAdminKey = ctx.apiKeyManager.create({
      name: 'secondary-admin',
      workspaceId: secondaryWorkspace.id,
      userId: 'secondary-admin',
      role: 'admin',
    }).rawKey
  })

  afterEach(async () => {
    await ctx.shutdown()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('filters document listings to the authenticated workspace', async () => {
    ctx.store.createDocument({
      title: 'default-only.md',
      sourceType: 'local',
      sourcePath: '/default-only.md',
      fileType: '.md',
    })

    const res = await app.request('/api/v1/documents', {
      headers: {
        'X-API-Key': secondaryAdminKey,
      },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toEqual([])
  })

  it('uploads documents into the authenticated workspace', async () => {
    const formData = new FormData()
    formData.append('file', new File(['# Team Doc'], 'team-doc.md', { type: 'text/markdown' }))

    const res = await app.request('/api/v1/documents/upload', {
      method: 'POST',
      headers: {
        'X-API-Key': secondaryAdminKey,
      },
      body: formData,
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    const row = ctx.db.get<{ workspace_id: string }>(
      'SELECT workspace_id FROM documents WHERE id = ?',
      [body.documentId]
    )
    expect(row?.workspace_id).toBe(secondaryWorkspaceId)
  })

  it('blocks conversation reads from another workspace', async () => {
    const conversation = ctx.conversationManager.create('Secret')
    ctx.conversationManager.addMessage(conversation.id, 'user', 'top secret')

    const res = await app.request(`/api/v1/conversations/${conversation.id}/messages`, {
      headers: {
        'X-API-Key': secondaryAdminKey,
      },
    })

    expect(res.status).toBe(404)
  })

  it('returns a public share link that resolves without authentication', async () => {
    const conversation = ctx.conversationManager.create('Shareable')
    ctx.conversationManager.addMessage(conversation.id, 'user', 'share this')

    const shareRes = await app.request(`/api/v1/conversations/${conversation.id}/share`, {
      method: 'POST',
      headers: {
        'X-API-Key': defaultAdminKey,
      },
    })

    expect(shareRes.status).toBe(200)
    const shareBody = await shareRes.json()
    expect(shareBody.shareUrl).toMatch(/^\/shared\//)

    const publicRes = await app.request(shareBody.shareUrl)
    expect(publicRes.status).toBe(200)
    const publicBody = await publicRes.json()
    expect(publicBody.conversation.id).toBe(conversation.id)
  })
})
