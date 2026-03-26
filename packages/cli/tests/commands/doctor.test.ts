import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from '@opendocs/server'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('doctor command logic', () => {
  let ctx: AppContext
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocs-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
  })
  afterEach(async () => { await ctx.shutdown(); rmSync(tempDir, { recursive: true, force: true }) })

  it('reports healthy state', () => {
    expect(ctx.store.listDocuments()).toEqual([])
    expect(ctx.workspaceManager.list().length).toBeGreaterThanOrEqual(1)
    expect(ctx.registry.listAll().length).toBeGreaterThan(0)
  })
})
