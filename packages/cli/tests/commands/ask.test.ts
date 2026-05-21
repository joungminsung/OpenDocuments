import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap, type AppContext } from 'opendocuments-server'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('ask command logic', () => {
  let ctx: AppContext
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    ctx = await bootstrap({ dataDir: tempDir })
  })
  afterEach(async () => { await ctx.shutdown(); rmSync(tempDir, { recursive: true, force: true }) })

  it('answers a greeting directly', async () => {
    const result = await ctx.ragEngine.query({ query: 'Hello', profile: 'balanced' })
    expect(result.route).toBe('direct')
    expect(result.answer).toBeDefined()
  })

  it('returns RAG results for document queries', async () => {
    await ctx.pipeline.ingest({
      title: 'test.md', content: '# Redis\n\nRedis is an in-memory data store.',
      sourceType: 'local', sourcePath: '/test.md', fileType: '.md',
    })
    // Use fast profile: this test verifies routing only, and balanced/precise
    // fan out to multi-query + HyDE + contextual retrieval LLM calls. Even 'fast'
    // issues one generate() call which can run tens of seconds on a real local
    // LLM (qwen2.5:14b), so the timeout is generous.
    const result = await ctx.ragEngine.query({ query: 'What is Redis?', profile: 'fast' })
    expect(result.route).toBe('rag')
  }, 120000)
})
