import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RAGEngine, boostByMetadata } from '../../src/rag/engine.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { EventBus } from '../../src/events/bus.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createMockEmbedder, createMockLLM } from '../_fixtures/mock-models.js'

function createMockModels() {
  return { embedder: createMockEmbedder(), llm: createMockLLM() }
}

describe('RAGEngine', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string
  let engine: RAGEngine

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)
    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const { embedder, llm } = createMockModels()

    const doc = store.createDocument({
      title: 'guide.md', sourceType: 'local', sourcePath: '/guide.md', fileType: '.md',
    })
    const embedResult = await embedder.embed!(['Redis configuration guide with examples', 'Python setup tutorial for beginners'])
    await store.storeChunks(doc.id, [
      { content: 'Redis configuration guide with examples', embedding: embedResult.dense[0], chunkType: 'semantic', position: 0, tokenCount: 5, headingHierarchy: ['# Redis'] },
      { content: 'Python setup tutorial for beginners', embedding: embedResult.dense[1], chunkType: 'semantic', position: 1, tokenCount: 5, headingHierarchy: ['# Python'] },
    ])

    engine = new RAGEngine({
      store, llm, embedder, eventBus: new EventBus(), defaultProfile: 'balanced',
    })
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('answers a question with RAG pipeline', async () => {
    const result = await engine.query({ query: 'How to configure Redis?' })
    expect(result.answer).toContain('Based on the context')
    expect(result.route).toBe('rag')
    expect(result.sources.length).toBeGreaterThan(0)
    expect(result.confidence.level).toBeDefined()
  })

  it('handles greetings with direct response', async () => {
    const result = await engine.query({ query: 'Hello!' })
    expect(result.route).toBe('direct')
    expect(result.answer).toContain('OpenDocuments')
    expect(result.sources).toHaveLength(0)
  })

  it('supports streaming mode', async () => {
    const chunks: string[] = []
    let sources: any = null
    for await (const event of engine.queryStream({ query: 'Redis config' })) {
      if (event.type === 'chunk') chunks.push(event.data as string)
      if (event.type === 'sources') sources = event.data
    }
    expect(chunks.join('')).toContain('Based on the context')
    expect(sources).toBeDefined()
  })

  it('respects profile settings', async () => {
    const fast = await engine.query({ query: 'Redis config', profile: 'fast' })
    expect(fast.profile).toBe('fast')
    expect(fast.sources.length).toBeLessThanOrEqual(3)
  })

  it('classifies intent and uses intent-specific prompt', async () => {
    const result = await engine.query({ query: 'How to implement the hello function?' })
    expect(result.route).toBe('rag')
    expect(result.answer).toBeDefined()
  })

  it('uses decomposition in precise profile', async () => {
    const result = await engine.query({ query: 'Redis vs MongoDB', profile: 'precise' })
    expect(result.route).toBe('rag')
    expect(result.profile).toBe('precise')
  })

  it('caches identical queries', async () => {
    const result1 = await engine.query({ query: 'What is Redis?' })
    const result2 = await engine.query({ query: 'What is Redis?' })
    // Second call should return a cached result with a different queryId
    expect(result2.queryId).not.toBe(result1.queryId)
    expect(result2.answer).toBe(result1.answer)
  })
})

function makeFakeEmbedder(onEmbed?: (texts: string[]) => void): any {
  return {
    name: 'e', type: 'model', version: '0', coreVersion: '^0',
    capabilities: { embedding: true },
    embed: async (texts: string[]) => {
      onEmbed?.(texts)
      return { dense: texts.map(() => [0.1, 0.2, 0.3]), sparse: [] }
    },
    setup: async () => {}, healthCheck: async () => ({ healthy: true }),
  }
}

function makeFakeLLM(onGenerate?: (prompt: string) => string): any {
  return {
    name: 'l', type: 'model', version: '0', coreVersion: '^0',
    capabilities: { llm: true },
    generate: async function*(prompt: string): AsyncIterable<string> {
      yield onGenerate?.(prompt) ?? 'stub answer'
    },
    setup: async () => {}, healthCheck: async () => ({ healthy: true }),
  }
}

describe('RAGEngine advanced retrieval features', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'engine-adv-test-'))
    vectorDb = await createLanceDB(tempDir)
  })
  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  async function seedStore(): Promise<DocumentStore> {
    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)
    const docId = store.createDocument({ title: 't', sourceType: 'local', sourcePath: '/t.md' }).id
    await store.storeChunks(docId, [
      { content: 'Redis caching chunk', embedding: [0.1, 0.2, 0.3], chunkType: 'semantic',
        position: 0, tokenCount: 3, headingHierarchy: ['Redis'], parentSection: 'Redis section full parent text' },
      { content: 'PostgreSQL ACID chunk', embedding: [0.5, 0.1, 0.1], chunkType: 'semantic',
        position: 1, tokenCount: 3, headingHierarchy: ['PostgreSQL'], parentSection: 'PostgreSQL section full parent text' },
    ])
    return store
  }

  it('calls HyDE when hyde feature is on', async () => {
    const store = await seedStore()
    const llmCalls: string[] = []
    const llm = makeFakeLLM(p => { llmCalls.push(p); return 'Redis is in-memory.' })
    const embedder = makeFakeEmbedder()
    const engine = new RAGEngine({
      store, llm, embedder, eventBus: new EventBus(), defaultProfile: 'precise',
    })
    await engine.query({ query: 'what is redis' })
    // Precise profile has hyde=true, so at least one LLM prompt should be a HyDE passage request.
    // Use a pattern that matches HyDE's distinctive wording but not the answer-generator prompt.
    const hydePrompt = llmCalls.find(p => /single-paragraph passage|factual extract from a reference/i.test(p) && p.includes('what is redis'))
    expect(hydePrompt, 'expected a HyDE prompt').toBeTruthy()
  })

  it('calls multi-query expansion when multiQuery feature is on', async () => {
    const store = await seedStore()
    const llmCalls: string[] = []
    const llm = makeFakeLLM(p => {
      llmCalls.push(p)
      if (p.includes('Rewrite')) return '1. redis cache\n2. redis in-memory\n3. caching in redis'
      return 'stub answer'
    })
    const engine = new RAGEngine({
      store, llm, embedder: makeFakeEmbedder(), eventBus: new EventBus(), defaultProfile: 'balanced',
    })
    await engine.query({ query: 'redis caching' })
    const mqPrompt = llmCalls.find(p => /Rewrite/i.test(p))
    expect(mqPrompt, 'expected a multi-query rewrite prompt').toBeTruthy()
  })

  it('does NOT call HyDE when profile is fast', async () => {
    const store = await seedStore()
    const llmCalls: string[] = []
    const llm = makeFakeLLM(p => { llmCalls.push(p); return 'stub' })
    const engine = new RAGEngine({
      store, llm, embedder: makeFakeEmbedder(), eventBus: new EventBus(), defaultProfile: 'fast',
    })
    await engine.query({ query: 'what is redis' })
    const hydePrompt = llmCalls.find(p => /single-paragraph passage|factual extract from a reference/i.test(p))
    expect(hydePrompt).toBeFalsy()
  })

  it('replaces content with parentSection when parentDocRetrieval is on', async () => {
    const store = await seedStore()
    const llm = makeFakeLLM(() => 'stub')
    const engine = new RAGEngine({
      store, llm, embedder: makeFakeEmbedder(), eventBus: new EventBus(), defaultProfile: 'balanced',
    })
    const result = await engine.query({ query: 'redis' })
    // Balanced has parentDocRetrieval=true; at least one source should carry the parent section text.
    const hasParentContent = result.sources.some(s => s.content.includes('full parent text'))
    expect(hasParentContent).toBe(true)
  })
})

describe('boostByMetadata', () => {
  const makeResult = (heading: string[], chunkType: string, score: number): any => ({
    chunkId: 'c1', content: 'test', score, documentId: 'd1',
    chunkType, headingHierarchy: heading, sourcePath: '/test.md', sourceType: 'local',
  })

  it('boosts score when query keyword is in heading', () => {
    const result = makeResult(['Redis', 'Configuration'], 'semantic', 0.5)
    const boosted = boostByMetadata([result], 'redis configuration', 'config')
    expect(boosted[0].score).toBeGreaterThan(0.5)
  })

  it('boosts code chunks for code intent', () => {
    const codeResult = makeResult(['Utils'], 'code-ast', 0.5)
    const textResult = makeResult(['Utils'], 'semantic', 0.5)
    const boosted = boostByMetadata([codeResult, textResult], 'how to use utils', 'code')
    const codeScore = boosted.find(r => r.chunkType === 'code-ast')!.score
    const textScore = boosted.find(r => r.chunkType === 'semantic')!.score
    expect(codeScore).toBeGreaterThan(textScore)
  })

  it('does not boost when no matches', () => {
    const result = makeResult(['Deployment'], 'semantic', 0.5)
    const boosted = boostByMetadata([result], 'authentication', 'general')
    expect(boosted[0].score).toBe(0.5)
  })
})
