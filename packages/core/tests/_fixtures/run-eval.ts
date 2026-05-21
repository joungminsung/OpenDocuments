/**
 * Operational RAG evaluation runner. NOT part of CI.
 *
 * Ingests the gold-dataset.json fixtures into an in-memory store, runs
 * `evaluate()` against each case, and prints a human-readable summary.
 *
 * Usage (from repo root or packages/core):
 *   # tsx is not a repo-level devDependency; invoke it through npx so it is
 *   # downloaded on-demand the first time:
 *   cd packages/core && npx tsx tests/_fixtures/run-eval.ts
 *
 * Note: this file lives next to the vitest fixtures but is standalone — it
 * deliberately does NOT import from `mock-models.ts` because that file pulls
 * in `vitest` globals (`vi.fn()`). The mock embedder is inlined below so the
 * runner can execute under plain tsx/node without a vitest environment.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { IngestPipeline } from '../../src/ingest/pipeline.js'
import { PluginRegistry } from '../../src/plugin/registry.js'
import { EventBus } from '../../src/events/bus.js'
import { MiddlewareRunner } from '../../src/ingest/middleware.js'
import { MarkdownParser } from '../../src/parsers/markdown.js'
import { RAGEngine } from '../../src/rag/engine.js'
import { evaluate } from '../../src/rag/eval.js'
import type { ModelPlugin, PluginContext } from '../../src/plugin/interfaces.js'

interface GoldFixture {
  id: string
  query: string
  intent?: string
  corpusTitle: string
  corpusFileType: string
  corpusContent: string
}

/**
 * Deterministic, self-contained mock embedder (no vitest dependency).
 * Produces stable 3-d vectors so retrieval is reproducible across runs.
 */
function createRunnerMockEmbedder(): ModelPlugin {
  return {
    name: '@opendocuments/model-runner-mock-embedder',
    type: 'model',
    version: '0.3.0',
    coreVersion: '^0.3.0',
    capabilities: { embedding: true },
    async setup(): Promise<void> {},
    async embed(texts: string[]) {
      return {
        dense: texts.map(t => {
          const h = t.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
          return [Math.sin(h), Math.cos(h), Math.sin(h * 2)]
        }),
      }
    },
  }
}

async function main(): Promise<void> {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const fixtures = JSON.parse(
    readFileSync(join(here, 'gold-dataset.json'), 'utf-8')
  ) as GoldFixture[]

  const db = createSQLiteDB(':memory:')
  runMigrations(db)
  const tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-eval-'))
  const vectorDb = await createLanceDB(tempDir)
  const store = new DocumentStore(db, vectorDb, 'ws-eval')
  await store.initialize(3)

  const registry = new PluginRegistry()
  const pluginCtx: PluginContext = { config: {}, dataDir: tempDir, log: console as any }
  const embedder = createRunnerMockEmbedder()
  await registry.register(embedder, pluginCtx)
  await registry.register(new MarkdownParser(), pluginCtx)

  const pipeline = new IngestPipeline({
    store,
    registry,
    eventBus: new EventBus(),
    middleware: new MiddlewareRunner(),
    embeddingDimensions: 3,
  })

  for (const f of fixtures) {
    await pipeline.ingest({
      title: f.corpusTitle,
      sourceType: 'local',
      sourcePath: `/gold/${f.id}/${f.corpusTitle}`,
      fileType: f.corpusFileType,
      content: f.corpusContent,
    })
  }

  // Minimal LLM stub so RAGEngine construction succeeds. Retrieval is what we measure.
  const stubLLM: ModelPlugin = {
    name: 'stub',
    type: 'model',
    version: '0',
    coreVersion: '^0',
    capabilities: { llm: true },
    async setup() {},
    async healthCheck() {
      return { healthy: true }
    },
    // eslint-disable-next-line require-yield
    async *generate(): AsyncIterable<string> {
      return
    },
  }

  const engine = new RAGEngine({
    store,
    llm: stubLLM,
    embedder,
    eventBus: new EventBus(),
    defaultProfile: 'fast',
  })

  const cases = fixtures.map(f => {
    const doc = store.getDocumentBySourcePath(`/gold/${f.id}/${f.corpusTitle}`)
    if (!doc) throw new Error(`Fixture ${f.id} was not ingested`)
    return { id: f.id, query: f.query, intent: f.intent, relevantDocumentIds: [doc.id] }
  })

  const summary = await evaluate(engine, cases)

  console.log('\n=== RAG Evaluation Summary ===')
  console.log(`Cases: ${summary.totalCases}`)
  console.log(`hit@3: ${summary.hitAt3.toFixed(3)}`)
  console.log(`hit@5: ${summary.hitAt5.toFixed(3)}`)
  console.log(`MRR:    ${summary.mrr.toFixed(3)}`)
  console.log(`nDCG@5: ${summary.nDCGAt5.toFixed(3)}`)
  console.log('\nBy intent:')
  for (const [intent, m] of Object.entries(summary.byIntent)) {
    console.log(`  ${intent.padEnd(10)} count=${m.count} hit@5=${m.hitAt5.toFixed(3)} MRR=${m.mrr.toFixed(3)}`)
  }

  db.close()
  await vectorDb.close()
  rmSync(tempDir, { recursive: true, force: true })
}

main().catch(err => {
  console.error('[eval:rag] Failed:', err)
  process.exit(1)
})
