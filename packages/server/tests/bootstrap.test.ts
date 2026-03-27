import { describe, it, expect, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '../src/bootstrap.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('bootstrap', () => {
  let tempDir: string
  let ctx: AppContext | null = null

  afterEach(async () => {
    if (ctx) { await ctx.shutdown(); ctx = null }
    if (tempDir) rmSync(tempDir, { recursive: true, force: true })
  })

  it('initializes all core components with default config', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    expect(ctx.config).toBeDefined()
    expect(ctx.db).toBeDefined()
    expect(ctx.vectorDb).toBeDefined()
    expect(ctx.registry).toBeDefined()
    expect(ctx.eventBus).toBeDefined()
    expect(ctx.pipeline).toBeDefined()
    expect(ctx.ragEngine).toBeDefined()
    expect(ctx.workspaceManager).toBeDefined()
  })

  it('creates default workspace on bootstrap', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
    const ws = ctx.workspaceManager.getByName('default')
    expect(ws).toBeDefined()
  })
})
