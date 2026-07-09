import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from 'opendocuments-server'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('doctor command logic', () => {
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
    ctx = await bootstrap({ dataDir: tempDir, configOverrides: { model: stubModel } })
  })
  afterEach(async () => { if (ctx) await ctx.shutdown(); rmSync(tempDir, { recursive: true, force: true }) })

  it('reports healthy state', () => {
    expect(ctx.store.listDocuments()).toEqual([])
    expect(ctx.workspaceManager.list().length).toBeGreaterThanOrEqual(1)
    expect(ctx.registry.listAll().length).toBeGreaterThan(0)
  })
})
