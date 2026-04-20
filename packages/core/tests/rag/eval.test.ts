import { describe, it, expect } from 'vitest'
import { hitAtK, reciprocalRank, nDCG } from '../../src/rag/eval.js'

describe('hitAtK', () => {
  it('is 1 when a relevant doc is in the top K', () => {
    expect(hitAtK(['a', 'b', 'c'], new Set(['b']), 3)).toBe(1)
  })
  it('is 0 when no relevant doc appears', () => {
    expect(hitAtK(['a', 'b', 'c'], new Set(['d']), 3)).toBe(0)
  })
  it('respects K — a match at position K+1 counts as miss', () => {
    expect(hitAtK(['a', 'b', 'c', 'd'], new Set(['d']), 3)).toBe(0)
    expect(hitAtK(['a', 'b', 'c', 'd'], new Set(['d']), 4)).toBe(1)
  })
})

describe('reciprocalRank', () => {
  it('is 1/rank of the first relevant doc', () => {
    expect(reciprocalRank(['a', 'b', 'c'], new Set(['a']))).toBe(1)
    expect(reciprocalRank(['a', 'b', 'c'], new Set(['b']))).toBeCloseTo(0.5)
    expect(reciprocalRank(['a', 'b', 'c'], new Set(['c']))).toBeCloseTo(1 / 3)
  })
  it('is 0 when no relevant doc', () => {
    expect(reciprocalRank(['a', 'b'], new Set(['z']))).toBe(0)
  })
})

describe('nDCG', () => {
  it('is 1 for the ideal ordering with a single relevant item', () => {
    expect(nDCG(['a', 'b', 'c'], new Set(['a']), 3)).toBeCloseTo(1)
  })
  it('penalizes later hits', () => {
    const top = nDCG(['x', 'a', 'y'], new Set(['a']), 3)
    expect(top).toBeGreaterThan(0)
    expect(top).toBeLessThan(1)
  })
  it('is 0 when no relevant items land in the top K', () => {
    expect(nDCG(['x', 'y', 'z'], new Set(['a']), 3)).toBe(0)
  })
})

// Integration: seed a DocumentStore with the gold fixtures, build a RAGEngine, run evaluate().
import { beforeEach, afterEach } from 'vitest'
import { RAGEngine } from '../../src/rag/engine.js'
import { IngestPipeline } from '../../src/ingest/pipeline.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { EventBus } from '../../src/events/bus.js'
import { MiddlewareRunner } from '../../src/ingest/middleware.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import { MarkdownParser } from '../../src/parsers/markdown.js'
import { createMockEmbedder } from '../_fixtures/mock-models.js'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { evaluate } from '../../src/rag/eval.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import type { PluginContext } from '../../src/plugin/interfaces.js'

interface GoldFixture {
  id: string
  query: string
  intent?: string
  corpusTitle: string
  corpusFileType: string
  corpusContent: string
}

describe('evaluate (integration)', () => {
  let db: DB
  let vectorDb: VectorDB
  let tempDir: string
  let store: DocumentStore
  let engine: RAGEngine

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'eval-test-'))
    vectorDb = await createLanceDB(tempDir)
    store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const registry = new PluginRegistry()
    const ctx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
    const embedder = createMockEmbedder()
    await registry.register(embedder, ctx)
    await registry.register(new MarkdownParser(), ctx)

    const pipeline = new IngestPipeline({
      store, registry,
      eventBus: new EventBus(), middleware: new MiddlewareRunner(),
      embeddingDimensions: 3,
    })

    // Seed every gold case as a document
    const fixturesPath = join(__dirname, '..', '_fixtures', 'gold-dataset.json')
    const cases = JSON.parse(readFileSync(fixturesPath, 'utf-8')) as GoldFixture[]
    for (const c of cases) {
      await pipeline.ingest({
        title: c.corpusTitle,
        sourceType: 'local',
        sourcePath: `/gold/${c.id}/${c.corpusTitle}`,
        fileType: c.corpusFileType,
        content: c.corpusContent,
      })
    }

    // Minimal LLM that just echoes a stub answer — retrieval is what we're measuring.
    const stubLLM: any = {
      name: 'stub', type: 'model', version: '0', coreVersion: '^0',
      capabilities: { llm: true },
      generate: async function*(): AsyncIterable<string> { yield 'stub' },
      setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    }
    engine = new RAGEngine({
      store, llm: stubLLM, embedder,
      eventBus: new EventBus(), defaultProfile: 'fast',
    })
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('computes a full EvalSummary over the gold fixtures', async () => {
    const fixturesPath = join(__dirname, '..', '_fixtures', 'gold-dataset.json')
    const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8')) as GoldFixture[]

    // Resolve the ingested document id for each fixture by sourcePath lookup.
    const cases = fixtures.map(f => {
      const docRow = store.getDocumentBySourcePath(`/gold/${f.id}/${f.corpusTitle}`)
      if (!docRow) throw new Error(`Fixture ${f.id} was not ingested`)
      return { id: f.id, query: f.query, intent: f.intent, relevantDocumentIds: [docRow.id] }
    })

    const summary = await evaluate(engine, cases)

    expect(summary.totalCases).toBe(fixtures.length)
    expect(summary.hitAt5).toBeGreaterThanOrEqual(0)
    expect(summary.hitAt5).toBeLessThanOrEqual(1)
    expect(summary.mrr).toBeGreaterThanOrEqual(0)
    expect(summary.mrr).toBeLessThanOrEqual(1)
    expect(Object.keys(summary.byIntent).length).toBeGreaterThan(0)
    // Every intent bucket is a valid [0, 1] number
    for (const intent of Object.keys(summary.byIntent)) {
      expect(summary.byIntent[intent].hitAt5).toBeGreaterThanOrEqual(0)
      expect(summary.byIntent[intent].hitAt5).toBeLessThanOrEqual(1)
    }
  }, 30000)  // Integration test — allow extra time for ingest + retrieval across 10 docs
})
