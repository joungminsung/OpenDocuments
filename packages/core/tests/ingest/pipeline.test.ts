import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IngestPipeline } from '../../src/ingest/pipeline.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { MarkdownParser } from '../../src/parsers/markdown.js'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { EventBus } from '../../src/events/bus.js'
import { MiddlewareRunner } from '../../src/ingest/middleware.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import type { PluginContext } from '../../src/plugin/interfaces.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createMockEmbedder } from '../_fixtures/mock-models.js'

describe('IngestPipeline', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string
  let pipeline: IngestPipeline

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)

    const registry = new PluginRegistry()
    const eventBus = new EventBus()
    const middleware = new MiddlewareRunner()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }

    await registry.register(createMockEmbedder(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    pipeline = new IngestPipeline({ store, registry, eventBus, middleware, embeddingDimensions: 3 })
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('ingests a markdown document end-to-end', { timeout: 15000 }, async () => {
    const result = await pipeline.ingest({
      title: 'test.md',
      content: '# Hello\n\nThis is a test document with some content.\n\n## Section 2\n\nMore content here.',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })
    expect(result.documentId).toBeDefined()
    expect(result.chunks).toBeGreaterThan(0)
    expect(result.status).toBe('indexed')
  })

  it('emits events during pipeline', async () => {
    const events: string[] = []
    const eventBus = new EventBus()
    eventBus.onAny((event) => events.push(event))

    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(createMockEmbedder(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const p2 = new IngestPipeline({
      store, registry, eventBus, middleware: new MiddlewareRunner(), embeddingDimensions: 3,
    })

    await p2.ingest({
      title: 'test.md',
      content: '# Test\n\nHello world.',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })

    expect(events).toContain('document:parsed')
    expect(events).toContain('document:chunked')
    expect(events).toContain('document:embedded')
    expect(events).toContain('document:indexed')
  })

  it('skips unchanged documents via content hash', async () => {
    const content = '# Test\n\nHello world.'
    const first = await pipeline.ingest({
      title: 'test.md', content, sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    expect(first.status).toBe('indexed')

    const second = await pipeline.ingest({
      title: 'test.md', content, sourceType: 'local', sourcePath: '/docs/test.md', fileType: '.md',
    })
    expect(second.status).toBe('skipped')
  })

  it('uses semanticChunkText when an embedding model is registered', async () => {
    // Spy on the embedder's embed calls to confirm sentence-level inputs were embedded.
    // The MarkdownParser produces a single 'semantic' ParsedChunk from the body;
    // semanticChunkText splits it into sentences before embedding.
    const embedSpy = vi.fn(async (texts: string[]) => ({
      dense: texts.map(() => [0.1, 0.2, 0.3]),
      sparse: [],
    }))
    const spyEmbedder: any = {
      name: 'spy-embedder', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { embedding: true, generation: false, reranking: false },
      embed: embedSpy,
      setup: async () => {},
      healthCheck: async () => ({ healthy: true }),
    }

    // Rebuild a fresh pipeline with the spy embedder instead of the default mock.
    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(spyEmbedder, ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const p = new IngestPipeline({
      store, registry, eventBus: new EventBus(), middleware: new MiddlewareRunner(),
      embeddingDimensions: 3,
    })

    await p.ingest({
      title: 'doc.md',
      sourceType: 'local',
      sourcePath: '/tmp/semantic-doc.md',
      fileType: '.md',
      content: 'First sentence about Redis caching. Second sentence about Redis pub/sub. Totally unrelated paragraph about PostgreSQL transactions here.',
    })

    // Semantic chunking triggers at least two embed invocations: one sentence-level
    // boundary-discovery call (multi-sentence batch) and one chunk-embedding call.
    // The old paragraph-based chunker called embed() exactly once with a single
    // whole-paragraph input, so each assertion below fails under the old code.
    expect(embedSpy.mock.calls.length).toBeGreaterThanOrEqual(2)

    // Boundary discovery embeds the sentence array in a single batch of length >= 2.
    const multiSentenceCall = embedSpy.mock.calls.find(
      call => Array.isArray(call[0]) && (call[0] as string[]).length >= 2,
    )
    expect(multiSentenceCall, 'expected a multi-sentence embed call (boundary discovery)').toBeTruthy()

    // At least one embedded input should be a single sentence ending in punctuation,
    // not a whole paragraph containing multiple sentences.
    const hadSingleSentenceInput = embedSpy.mock.calls.some(call => {
      const arr = call[0] as string[]
      return arr.some(s => /^[^.!?]+[.!?]$/.test(s.trim()))
    })
    expect(hadSingleSentenceInput, 'expected at least one sentence-shaped embed input').toBe(true)
  })

  it('generates and embeds contextual prefixes when contextualRetrieval feature is on', async () => {
    // Spy on the embedder to see what text it was given.
    const embedSpy = vi.fn(async (texts: string[]) => ({
      dense: texts.map(() => [0.1, 0.2, 0.3]),
      sparse: [],
    }))
    const spyEmbedder: any = {
      name: 'spy-embedder', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { embedding: true },
      embed: embedSpy,
      setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    }
    // Stub LLM: for every chunk we're asked about, emit a deterministic prefix.
    const llmCalls: string[] = []
    const stubLLM: any = {
      name: 'stub-llm', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { llm: true },
      generate: async function*(prompt: string): AsyncIterable<string> {
        llmCalls.push(prompt)
        yield 'CTX_PREFIX_' + llmCalls.length
      },
      setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    }

    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(spyEmbedder, ctx)
    await registry.register(stubLLM, ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const p = new IngestPipeline({
      store, registry, eventBus: new EventBus(), middleware: new MiddlewareRunner(),
      embeddingDimensions: 3,
    })

    await p.ingest({
      title: 'doc.md',
      sourceType: 'local',
      sourcePath: '/tmp/ctx-doc.md',
      fileType: '.md',
      content: '# Redis\n\nRedis is an in-memory store used for caching. It supports pub/sub and streams.',
    }, { contextualRetrieval: true })

    // 1. The LLM was asked at least once to produce a context
    expect(llmCalls.length).toBeGreaterThan(0)

    // 2. At least one embed batch contained a string that begins with the generated prefix followed by the chunk content
    const allEmbedInputs = embedSpy.mock.calls.flatMap(c => c[0] as string[])
    const hasPrefixedInput = allEmbedInputs.some(s => /^CTX_PREFIX_\d+\n\n/.test(s))
    expect(hasPrefixedInput, `expected an embed input to start with CTX_PREFIX. Got: ${allEmbedInputs.map(s => JSON.stringify(s.slice(0, 60))).join(' | ')}`).toBe(true)
  })

  it('augments FTS content with propositions + questions when chunkAugmentation is on', async () => {
    const propsOutput = '- Redis is in-memory.\n- Redis supports caching.'
    const qsOutput = '1. What is Redis?\n2. What is Redis used for?\n3. Is Redis in-memory?'
    const stubLLM: any = {
      name: 'aug-llm', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { llm: true },
      generate: async function*(prompt: string): AsyncIterable<string> {
        // Very simple router: proposition prompts mention "propositions", questions mention "Questions:"
        yield /Propositions:/i.test(prompt) ? propsOutput : qsOutput
      },
      setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    }
    const embedder = createMockEmbedder()
    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(embedder, ctx)
    await registry.register(stubLLM, ctx)
    await registry.register(new MarkdownParser(), ctx)
    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const p = new IngestPipeline({
      store, registry, eventBus: new EventBus(), middleware: new MiddlewareRunner(),
      embeddingDimensions: 3,
    })
    await p.ingest({
      title: 'aug.md', sourceType: 'local', sourcePath: '/tmp/aug.md',
      fileType: '.md', content: '# Redis\n\nRedis is an in-memory store used for caching.',
    }, { chunkAugmentation: true })

    // Search FTS directly using a term that only appears in the augmented content
    const hits = await store.searchFTS('What is Redis', 5)
    expect(hits.length).toBeGreaterThan(0)
    // And propositions keywords
    const propHits = await store.searchFTS('caching', 5)
    expect(propHits.length).toBeGreaterThan(0)
  })

  it('returns canonical chunk content for FTS hits even when augmentation text matched', async () => {
    const propsOutput = '- Redis is in-memory.\n- Redis supports caching.'
    const qsOutput = '1. What is Redis?\n2. What is Redis used for?\n3. Is Redis in-memory?'
    const stubLLM: any = {
      name: 'aug-llm', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { llm: true },
      generate: async function*(prompt: string): AsyncIterable<string> {
        yield /Propositions:/i.test(prompt) ? propsOutput : qsOutput
      },
      setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    }
    const embedder = createMockEmbedder()
    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(embedder, ctx)
    await registry.register(stubLLM, ctx)
    await registry.register(new MarkdownParser(), ctx)
    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const p = new IngestPipeline({
      store, registry, eventBus: new EventBus(), middleware: new MiddlewareRunner(),
      embeddingDimensions: 3,
    })
    await p.ingest({
      title: 'aug.md', sourceType: 'local', sourcePath: '/tmp/aug.md',
      fileType: '.md', content: '# Redis\n\nRedis is an in-memory store used for caching.',
    }, { chunkAugmentation: true })

    const hits = await store.searchFTS('What is Redis', 5)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].content).not.toContain('What is Redis?')
    expect(hits[0].content).not.toContain('Redis supports caching.')
    expect(hits[0].content).toContain('Redis is an in-memory store used for caching.')
  })

  it('skips contextual generation when the feature is off (default)', async () => {
    const embedSpy = vi.fn(async (texts: string[]) => ({
      dense: texts.map(() => [0.1, 0.2, 0.3]),
      sparse: [],
    }))
    const spyEmbedder: any = {
      name: 'spy-embedder', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { embedding: true },
      embed: embedSpy,
      setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    }
    const llmCalls: string[] = []
    const stubLLM: any = {
      name: 'stub-llm', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { llm: true },
      generate: async function*(prompt: string): AsyncIterable<string> {
        llmCalls.push(prompt); yield 'SHOULD_NOT_HAPPEN'
      },
      setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    }

    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    await registry.register(spyEmbedder, ctx)
    await registry.register(stubLLM, ctx)
    await registry.register(new MarkdownParser(), ctx)
    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)
    const p = new IngestPipeline({
      store, registry, eventBus: new EventBus(), middleware: new MiddlewareRunner(),
      embeddingDimensions: 3,
    })

    await p.ingest({
      title: 'nope.md', sourceType: 'local', sourcePath: '/tmp/nope.md',
      fileType: '.md', content: '# Hello\n\nBody.',
    }) // no options arg -- feature off

    expect(llmCalls).toEqual([])
    // No embed input should contain the SHOULD_NOT_HAPPEN sentinel either
    const allEmbedInputs = embedSpy.mock.calls.flatMap(c => c[0] as string[])
    expect(allEmbedInputs.some(s => s.includes('SHOULD_NOT_HAPPEN'))).toBe(false)
  })
})
