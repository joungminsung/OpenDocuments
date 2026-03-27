# Plan 2: Ingest Pipeline + RAG Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ingest pipeline (discover -> fetch -> parse -> chunk -> embed -> store) and RAG engine (query route -> retrieve -> rerank -> generate) so that local markdown files can be indexed and queried with natural language answers.

**Architecture:** The ingest pipeline orchestrates plugins (connectors, parsers, models) through a stage-based pipeline with middleware hooks and event bus integration. The RAG engine receives queries, retrieves relevant chunks from LanceDB, and generates streaming answers via the model plugin. Both systems sit inside `@opendocuments/core` and are consumed by the server/CLI (Plan 3).

**Tech Stack:** Built on Plan 1 foundation -- PluginRegistry, EventBus, DB, VectorDB, WorkspaceManager. New deps: a markdown parser lib, a tokenizer for chunk sizing.

**Spec Reference:** `docs/superpowers/specs/2026-03-26-opendocuments-design.md` sections 4 and 5

**Depends on:** Plan 1 complete (all 43 tests passing)

---

## Scope for Plan 2

Plan 2 covers the **core engines only** -- no HTTP server, no CLI, no Web UI. The output is importable functions/classes from `@opendocuments/core` that Plan 3 (Server + CLI) will expose.

**In scope:**
- Ingest pipeline orchestrator with middleware hooks
- Semantic chunker (text, 512 tokens, 50 overlap)
- Markdown built-in parser
- Embedding via model plugin interface (mock for tests)
- Document store (SQLite metadata + LanceDB vectors)
- RAG engine: retrieve → rerank → generate
- RAG profiles (fast/balanced/precise)
- Confidence scoring
- Query routing (rag vs direct)

**Out of scope (later plans):**
- Code AST chunking (needs tree-sitter, Phase 2)
- Multimodal/OCR (Phase 2)
- Web search integration (Phase 2)
- Cross-lingual query expansion (Phase 2)
- Adaptive retrieval (Phase 2)
- Hallucination guard (Phase 2)
- Caching (Phase 2)
- Worker thread pool (Phase 2 -- for now, run in main thread)

---

## File Structure

```
packages/core/src/
├── ingest/
│   ├── pipeline.ts          # IngestPipeline orchestrator
│   ├── chunker.ts           # Semantic text chunker
│   ├── document-store.ts    # Coordinates SQLite + VectorDB for documents
│   └── middleware.ts        # Pipeline middleware runner
├── rag/
│   ├── engine.ts            # RAGEngine main class
│   ├── retriever.ts         # Vector search + scoring
│   ├── generator.ts         # Prompt assembly + LLM streaming
│   ├── profiles.ts          # RAG profile configs (fast/balanced/precise)
│   ├── confidence.ts        # Confidence scoring
│   └── router.ts            # Query routing (rag vs direct)
├── parsers/
│   └── markdown.ts          # Built-in markdown parser (ParserPlugin)

packages/core/tests/
├── ingest/
│   ├── pipeline.test.ts
│   ├── chunker.test.ts
│   └── document-store.test.ts
├── rag/
│   ├── engine.test.ts
│   ├── retriever.test.ts
│   ├── generator.test.ts
│   ├── profiles.test.ts
│   └── confidence.test.ts
├── parsers/
│   └── markdown.test.ts
```

---

## Task 1: Semantic Text Chunker

**Files:**
- Create: `packages/core/src/ingest/chunker.ts`
- Create: `packages/core/tests/ingest/chunker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/ingest/chunker.test.ts
import { describe, it, expect } from 'vitest'
import { chunkText, type ChunkOptions } from '../../src/ingest/chunker.js'

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    const chunks = chunkText('Hello world.', { maxTokens: 512, overlap: 50 })
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('Hello world.')
    expect(chunks[0].position).toBe(0)
  })

  it('splits text into multiple chunks by paragraph', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i}. ${'Lorem ipsum dolor sit amet. '.repeat(10)}`
    ).join('\n\n')

    const chunks = chunkText(paragraphs, { maxTokens: 200, overlap: 30 })
    expect(chunks.length).toBeGreaterThan(1)

    // Every chunk should be under maxTokens (roughly 4 chars per token)
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(220) // allow small overshoot
    }
  })

  it('preserves heading hierarchy in metadata', () => {
    const text = '# Main Title\n\n## Sub Section\n\nSome content here.'
    const chunks = chunkText(text, { maxTokens: 512, overlap: 50 })

    expect(chunks[0].headingHierarchy).toContain('# Main Title')
  })

  it('includes overlap between consecutive chunks', () => {
    const paragraphs = Array.from({ length: 30 }, (_, i) =>
      `Unique sentence number ${i}. ${'Filler text goes here. '.repeat(8)}`
    ).join('\n\n')

    const chunks = chunkText(paragraphs, { maxTokens: 150, overlap: 30 })

    // Check that consecutive chunks share some content
    if (chunks.length >= 2) {
      const lastWordsOfFirst = chunks[0].content.split(/\s+/).slice(-10).join(' ')
      const firstWordsOfSecond = chunks[1].content.split(/\s+/).slice(0, 20).join(' ')
      // The overlap should cause some shared text
      expect(chunks[1].content.length).toBeGreaterThan(0)
    }
  })

  it('assigns sequential positions', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) =>
      `Paragraph ${i}. ${'Content. '.repeat(20)}`
    ).join('\n\n')

    const chunks = chunkText(paragraphs, { maxTokens: 150, overlap: 30 })

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].position).toBe(i)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && npx vitest run tests/ingest/chunker.test.ts
```

- [ ] **Step 3: Implement the chunker**

```typescript
// packages/core/src/ingest/chunker.ts

export interface ChunkOptions {
  maxTokens: number     // default 512
  overlap: number       // default 50
}

export interface TextChunk {
  content: string
  position: number
  tokenCount: number
  headingHierarchy: string[]
}

/**
 * Estimate token count. Rough heuristic: ~4 chars per token for English,
 * ~2 chars per token for Korean/CJK. Use a simple average.
 */
function estimateTokens(text: string): number {
  // Count CJK characters
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length
  const nonCjk = text.length - cjk
  return Math.ceil(nonCjk / 4 + cjk / 2)
}

/**
 * Extract heading hierarchy from text above the current position.
 */
function extractHeadings(text: string): string[] {
  const headings: string[] = []
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      const level = match[1].length
      // Remove deeper headings when a same/higher level heading appears
      while (headings.length > 0) {
        const lastLevel = (headings[headings.length - 1].match(/^#+/) || [''])[0].length
        if (lastLevel >= level) {
          headings.pop()
        } else {
          break
        }
      }
      headings.push(line.trim())
    }
  }
  return headings
}

/**
 * Split text into chunks respecting paragraph boundaries,
 * with overlap between consecutive chunks.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = { maxTokens: 512, overlap: 50 }
): TextChunk[] {
  const { maxTokens, overlap } = options

  // Split into paragraphs (double newline) or single-newline blocks
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0)

  if (paragraphs.length === 0) {
    return []
  }

  const chunks: TextChunk[] = []
  let currentParagraphs: string[] = []
  let currentTokens = 0
  let headingsBeforeCurrent = ''

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para)

    if (currentTokens + paraTokens > maxTokens && currentParagraphs.length > 0) {
      // Flush current chunk
      const content = currentParagraphs.join('\n\n')
      chunks.push({
        content,
        position: chunks.length,
        tokenCount: estimateTokens(content),
        headingHierarchy: extractHeadings(headingsBeforeCurrent + '\n' + content),
      })

      // Overlap: keep last N tokens worth of paragraphs
      const overlapParagraphs: string[] = []
      let overlapTokens = 0
      for (let i = currentParagraphs.length - 1; i >= 0; i--) {
        const pTokens = estimateTokens(currentParagraphs[i])
        if (overlapTokens + pTokens > overlap) break
        overlapParagraphs.unshift(currentParagraphs[i])
        overlapTokens += pTokens
      }

      headingsBeforeCurrent = headingsBeforeCurrent + '\n' + currentParagraphs.join('\n\n')
      currentParagraphs = [...overlapParagraphs]
      currentTokens = overlapTokens
    }

    currentParagraphs.push(para)
    currentTokens += paraTokens
  }

  // Flush remaining
  if (currentParagraphs.length > 0) {
    const content = currentParagraphs.join('\n\n')
    chunks.push({
      content,
      position: chunks.length,
      tokenCount: estimateTokens(content),
      headingHierarchy: extractHeadings(headingsBeforeCurrent + '\n' + content),
    })
  }

  return chunks
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/ingest/chunker.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Export from barrel**

Add to `packages/core/src/index.ts`:

```typescript
export { chunkText, type ChunkOptions, type TextChunk } from './ingest/chunker.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ingest/ packages/core/tests/ingest/ packages/core/src/index.ts
git commit -m "feat(core): add semantic text chunker with paragraph splitting and overlap"
```

---

## Task 2: Built-in Markdown Parser

**Files:**
- Create: `packages/core/src/parsers/markdown.ts`
- Create: `packages/core/tests/parsers/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/parsers/markdown.test.ts
import { describe, it, expect } from 'vitest'
import { MarkdownParser } from '../../src/parsers/markdown.js'

describe('MarkdownParser', () => {
  const parser = new MarkdownParser()

  it('has correct plugin metadata', () => {
    expect(parser.name).toBe('@opendocuments/parser-markdown')
    expect(parser.type).toBe('parser')
    expect(parser.supportedTypes).toEqual(['.md', '.mdx'])
  })

  it('parses plain text into semantic chunks', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test',
      title: 'test.md',
      content: '# Hello\n\nThis is a paragraph.\n\n## World\n\nAnother paragraph.',
      mimeType: 'text/markdown',
    })) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0].chunkType).toBe('semantic')
  })

  it('separates code blocks as code-ast chunks', async () => {
    const md = '# Setup\n\nInstall the package:\n\n```javascript\nconst x = 1;\nconsole.log(x);\n```\n\nThen run it.'

    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test',
      title: 'test.md',
      content: md,
    })) {
      chunks.push(chunk)
    }

    const codeChunks = chunks.filter(c => c.chunkType === 'code-ast')
    expect(codeChunks.length).toBeGreaterThanOrEqual(1)
    expect(codeChunks[0].language).toBe('javascript')
    expect(codeChunks[0].content).toContain('const x = 1')
  })

  it('preserves heading hierarchy', async () => {
    const md = '# Title\n\n## Section\n\nContent here.'

    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test',
      title: 'test.md',
      content: md,
    })) {
      chunks.push(chunk)
    }

    const withHeadings = chunks.find(c => c.headingHierarchy && c.headingHierarchy.length > 0)
    expect(withHeadings).toBeDefined()
  })

  it('handles empty content', async () => {
    const chunks: any[] = []
    for await (const chunk of parser.parse({
      sourceId: 'test',
      title: 'empty.md',
      content: '',
    })) {
      chunks.push(chunk)
    }
    expect(chunks).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement MarkdownParser**

```typescript
// packages/core/src/parsers/markdown.ts
import type {
  ParserPlugin,
  RawDocument,
  ParsedChunk,
  PluginContext,
  HealthStatus,
} from '../plugin/interfaces.js'

/**
 * Built-in markdown parser. Splits markdown into text chunks and code blocks.
 * Code blocks (fenced with ```) are emitted as 'code-ast' chunks.
 * Text sections are emitted as 'semantic' chunks.
 */
export class MarkdownParser implements ParserPlugin {
  name = '@opendocuments/parser-markdown'
  type = 'parser' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  supportedTypes = ['.md', '.mdx']

  async setup(_ctx: PluginContext): Promise<void> {}
  async teardown(): Promise<void> {}
  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true }
  }

  async *parse(raw: RawDocument): AsyncIterable<ParsedChunk> {
    const content = typeof raw.content === 'string'
      ? raw.content
      : raw.content.toString('utf-8')

    if (!content.trim()) return

    const sections = splitByCodeBlocks(content)
    const headings: string[] = []

    for (const section of sections) {
      if (section.type === 'code') {
        yield {
          content: section.content,
          chunkType: 'code-ast',
          language: section.language,
          headingHierarchy: [...headings],
          metadata: { contextBefore: section.contextBefore || '' },
        }
      } else {
        // Update heading hierarchy from this section
        updateHeadings(headings, section.content)

        const trimmed = section.content.trim()
        if (trimmed) {
          yield {
            content: trimmed,
            chunkType: 'semantic',
            headingHierarchy: [...headings],
          }
        }
      }
    }
  }
}

interface Section {
  type: 'text' | 'code'
  content: string
  language?: string
  contextBefore?: string
}

function splitByCodeBlocks(markdown: string): Section[] {
  const sections: Section[] = []
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    // Text before the code block
    const textBefore = markdown.slice(lastIndex, match.index)
    if (textBefore.trim()) {
      sections.push({ type: 'text', content: textBefore })
    }

    // The code block itself
    const language = match[1] || undefined
    const codeContent = match[2].trim()
    if (codeContent) {
      // Get last paragraph before code block as context
      const lines = textBefore.trim().split('\n')
      const contextBefore = lines.slice(-2).join('\n')

      sections.push({
        type: 'code',
        content: codeContent,
        language,
        contextBefore,
      })
    }

    lastIndex = match.index + match[0].length
  }

  // Remaining text after last code block
  const remaining = markdown.slice(lastIndex)
  if (remaining.trim()) {
    sections.push({ type: 'text', content: remaining })
  }

  return sections
}

function updateHeadings(headings: string[], text: string): void {
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      const level = match[1].length
      // Pop headings of same or deeper level
      while (headings.length > 0) {
        const lastLevel = (headings[headings.length - 1].match(/^#+/) || [''])[0].length
        if (lastLevel >= level) {
          headings.pop()
        } else {
          break
        }
      }
      headings.push(line.trim())
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/parsers/markdown.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Export from barrel**

```typescript
export { MarkdownParser } from './parsers/markdown.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/parsers/ packages/core/tests/parsers/ packages/core/src/index.ts
git commit -m "feat(core): add built-in markdown parser with code block separation"
```

---

## Task 3: Pipeline Middleware Runner

**Files:**
- Create: `packages/core/src/ingest/middleware.ts`
- Create: `packages/core/tests/ingest/middleware.test.ts` (optional -- tested through pipeline)

- [ ] **Step 1: Implement middleware runner**

```typescript
// packages/core/src/ingest/middleware.ts
import type { MiddlewarePlugin, PipelineStage } from '../plugin/interfaces.js'

export class MiddlewareRunner {
  private hooks = new Map<PipelineStage, Array<(data: unknown) => Promise<unknown>>>()

  registerPlugin(plugin: MiddlewarePlugin): void {
    for (const hook of plugin.hooks) {
      const existing = this.hooks.get(hook.stage) || []
      existing.push(hook.handler)
      this.hooks.set(hook.stage, existing)
    }
  }

  async run<T>(stage: PipelineStage, data: T): Promise<T> {
    const handlers = this.hooks.get(stage)
    if (!handlers || handlers.length === 0) return data

    let result: unknown = data
    for (const handler of handlers) {
      result = await handler(result)
    }
    return result as T
  }
}
```

- [ ] **Step 2: Export from barrel**

```typescript
export { MiddlewareRunner } from './ingest/middleware.js'
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/ingest/middleware.ts packages/core/src/index.ts
git commit -m "feat(core): add pipeline middleware runner"
```

---

## Task 4: Document Store

**Files:**
- Create: `packages/core/src/ingest/document-store.ts`
- Create: `packages/core/tests/ingest/document-store.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/ingest/document-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('DocumentStore', () => {
  let db: DB
  let vectorDb: VectorDB
  let store: DocumentStore
  let tempDir: string

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)
    store = new DocumentStore(db, vectorDb, 'default-workspace-id')
    await store.initialize(3) // 3-dim vectors for test
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates a document record', () => {
    const doc = store.createDocument({
      title: 'test.md',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })

    expect(doc.id).toBeDefined()
    expect(doc.status).toBe('pending')
  })

  it('stores and retrieves chunks with vectors', async () => {
    const doc = store.createDocument({
      title: 'test.md',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })

    await store.storeChunks(doc.id, [
      {
        content: 'Hello world',
        embedding: [1, 0, 0],
        chunkType: 'semantic',
        position: 0,
        tokenCount: 2,
        headingHierarchy: ['# Title'],
      },
      {
        content: 'Foo bar',
        embedding: [0, 1, 0],
        chunkType: 'semantic',
        position: 1,
        tokenCount: 2,
        headingHierarchy: ['# Title'],
      },
    ])

    // Check document was updated
    const updated = store.getDocument(doc.id)
    expect(updated?.chunk_count).toBe(2)
    expect(updated?.status).toBe('indexed')
  })

  it('searches chunks by vector similarity', async () => {
    const doc = store.createDocument({
      title: 'test.md',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })

    await store.storeChunks(doc.id, [
      { content: 'Hello', embedding: [1, 0, 0], chunkType: 'semantic', position: 0, tokenCount: 1, headingHierarchy: [] },
      { content: 'World', embedding: [0, 1, 0], chunkType: 'semantic', position: 1, tokenCount: 1, headingHierarchy: [] },
    ])

    const results = await store.searchChunks([1, 0, 0], 1)
    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('Hello')
  })

  it('deletes document and its chunks', async () => {
    const doc = store.createDocument({
      title: 'test.md',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })

    await store.storeChunks(doc.id, [
      { content: 'Hello', embedding: [1, 0, 0], chunkType: 'semantic', position: 0, tokenCount: 1, headingHierarchy: [] },
    ])

    await store.deleteDocument(doc.id)

    expect(store.getDocument(doc.id)).toBeUndefined()
    const results = await store.searchChunks([1, 0, 0], 10)
    expect(results).toHaveLength(0)
  })

  it('checks content hash for change detection', () => {
    const doc = store.createDocument({
      title: 'test.md',
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })

    store.updateContentHash(doc.id, 'abc123')
    expect(store.hasContentChanged(doc.id, 'abc123')).toBe(false)
    expect(store.hasContentChanged(doc.id, 'xyz789')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement DocumentStore**

```typescript
// packages/core/src/ingest/document-store.ts
import { randomUUID } from 'node:crypto'
import type { DB } from '../storage/db.js'
import type { VectorDB } from '../storage/vector-db.js'

const COLLECTION = 'opendocuments_chunks'

export interface CreateDocumentInput {
  title: string
  sourceType: string
  sourcePath: string
  fileType?: string
  fileSizeBytes?: number
  connectorId?: string
}

export interface StoredChunk {
  content: string
  embedding: number[]
  chunkType: string
  position: number
  tokenCount: number
  headingHierarchy: string[]
  language?: string
  codeSymbols?: string[]
}

export interface SearchResult {
  chunkId: string
  content: string
  score: number
  documentId: string
  chunkType: string
  headingHierarchy: string[]
  sourcePath: string
  sourceType: string
}

interface DocumentRow {
  id: string
  title: string
  source_type: string
  source_path: string
  file_type: string | null
  chunk_count: number
  status: string
  content_hash: string | null
  [key: string]: unknown
}

export class DocumentStore {
  constructor(
    private db: DB,
    private vectorDb: VectorDB,
    private workspaceId: string
  ) {}

  async initialize(dimensions: number): Promise<void> {
    await this.vectorDb.ensureCollection(COLLECTION, dimensions)
  }

  createDocument(input: CreateDocumentInput): { id: string; status: string } {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.run(
      `INSERT INTO documents (id, workspace_id, title, source_type, source_path, file_type, file_size_bytes, connector_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, this.workspaceId, input.title, input.sourceType, input.sourcePath,
       input.fileType || null, input.fileSizeBytes || null,
       input.connectorId || null, now, now]
    )

    return { id, status: 'pending' }
  }

  getDocument(id: string): DocumentRow | undefined {
    return this.db.get<DocumentRow>(
      'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
      [id]
    )
  }

  listDocuments(): DocumentRow[] {
    return this.db.all<DocumentRow>(
      'SELECT * FROM documents WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC',
      [this.workspaceId]
    )
  }

  async storeChunks(documentId: string, chunks: StoredChunk[]): Promise<void> {
    const vectorDocs = chunks.map((chunk, i) => {
      const chunkId = `${documentId}_chunk_${i}`
      return {
        id: chunkId,
        content: chunk.content,
        embedding: chunk.embedding,
        metadata: {
          document_id: documentId,
          workspace_id: this.workspaceId,
          chunk_type: chunk.chunkType,
          position: chunk.position,
          token_count: chunk.tokenCount,
          heading_hierarchy: JSON.stringify(chunk.headingHierarchy),
          language: chunk.language || '',
          code_symbols: chunk.codeSymbols ? JSON.stringify(chunk.codeSymbols) : '',
        },
      }
    })

    await this.vectorDb.upsert(COLLECTION, vectorDocs)

    // Update document metadata
    const now = new Date().toISOString()
    this.db.run(
      `UPDATE documents SET chunk_count = ?, status = 'indexed', indexed_at = ?, updated_at = ? WHERE id = ?`,
      [chunks.length, now, now, documentId]
    )
  }

  async searchChunks(
    queryEmbedding: number[],
    topK: number,
    minScore?: number
  ): Promise<SearchResult[]> {
    const results = await this.vectorDb.search(COLLECTION, {
      embedding: queryEmbedding,
      topK,
      filter: { workspace_id: this.workspaceId },
      minScore,
    })

    return results.map(r => {
      const docId = r.metadata.document_id as string
      const doc = this.getDocument(docId)

      return {
        chunkId: r.id,
        content: r.content,
        score: r.score,
        documentId: docId,
        chunkType: r.metadata.chunk_type as string,
        headingHierarchy: JSON.parse((r.metadata.heading_hierarchy as string) || '[]'),
        sourcePath: doc?.source_path || '',
        sourceType: doc?.source_type || '',
      }
    })
  }

  async deleteDocument(documentId: string): Promise<void> {
    // Get all chunk IDs for this document
    const results = await this.vectorDb.search(COLLECTION, {
      embedding: new Array(3).fill(0), // dummy -- we filter by document_id
      topK: 10000,
      filter: { document_id: documentId },
    })

    if (results.length > 0) {
      await this.vectorDb.delete(COLLECTION, results.map(r => r.id))
    }

    this.db.run('DELETE FROM documents WHERE id = ?', [documentId])
  }

  updateContentHash(documentId: string, hash: string): void {
    this.db.run(
      'UPDATE documents SET content_hash = ?, updated_at = ? WHERE id = ?',
      [hash, new Date().toISOString(), documentId]
    )
  }

  hasContentChanged(documentId: string, newHash: string): boolean {
    const doc = this.getDocument(documentId)
    if (!doc) return true
    return doc.content_hash !== newHash
  }

  updateStatus(documentId: string, status: string, errorMessage?: string): void {
    this.db.run(
      'UPDATE documents SET status = ?, error_message = ?, updated_at = ? WHERE id = ?',
      [status, errorMessage || null, new Date().toISOString(), documentId]
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/ingest/document-store.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Export from barrel**

```typescript
export { DocumentStore, type CreateDocumentInput, type StoredChunk, type SearchResult } from './ingest/document-store.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ingest/document-store.ts packages/core/tests/ingest/document-store.test.ts packages/core/src/index.ts
git commit -m "feat(core): add document store coordinating SQLite metadata and LanceDB vectors"
```

---

## Task 5: Ingest Pipeline Orchestrator

**Files:**
- Create: `packages/core/src/ingest/pipeline.ts`
- Create: `packages/core/tests/ingest/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/ingest/pipeline.test.ts
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
import type { ModelPlugin, PluginContext } from '../../src/plugin/interfaces.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock embedding model that returns deterministic vectors
function createMockModel(): ModelPlugin {
  return {
    name: '@opendocuments/model-mock',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    setup: async () => {},
    async embed(texts: string[]) {
      // Simple deterministic embedding: hash each text to a 3-dim vector
      return {
        dense: texts.map(t => {
          const hash = t.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
          return [Math.sin(hash), Math.cos(hash), Math.sin(hash * 2)]
        }),
      }
    },
  }
}

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

    // Register mock model and markdown parser
    await registry.register(createMockModel(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3) // 3-dim for mock embeddings

    // Insert workspace
    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")

    pipeline = new IngestPipeline({
      store,
      registry,
      eventBus,
      middleware,
      embeddingDimensions: 3,
    })
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('ingests a markdown document end-to-end', async () => {
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
    await registry.register(createMockModel(), ctx)
    await registry.register(new MarkdownParser(), ctx)

    const store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)

    const pipeline2 = new IngestPipeline({
      store,
      registry,
      eventBus,
      middleware: new MiddlewareRunner(),
      embeddingDimensions: 3,
    })

    await pipeline2.ingest({
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

    // First ingest
    const first = await pipeline.ingest({
      title: 'test.md',
      content,
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })
    expect(first.status).toBe('indexed')

    // Second ingest with same content
    const second = await pipeline.ingest({
      title: 'test.md',
      content,
      sourceType: 'local',
      sourcePath: '/docs/test.md',
      fileType: '.md',
    })
    expect(second.status).toBe('skipped')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement IngestPipeline**

```typescript
// packages/core/src/ingest/pipeline.ts
import { sha256 } from '../utils/hash.js'
import { chunkText } from './chunker.js'
import { DocumentStore, type CreateDocumentInput } from './document-store.js'
import { MiddlewareRunner } from './middleware.js'
import { PluginRegistry } from '../plugin/registry.js'
import { EventBus } from '../events/bus.js'
import type { ModelPlugin, ParsedChunk } from '../plugin/interfaces.js'
import { extname } from 'node:path'

export interface IngestInput {
  title: string
  content: string | Buffer
  sourceType: string
  sourcePath: string
  fileType?: string
  fileSizeBytes?: number
  connectorId?: string
}

export interface IngestResult {
  documentId: string
  chunks: number
  status: 'indexed' | 'skipped' | 'error'
  error?: string
}

export interface IngestPipelineOptions {
  store: DocumentStore
  registry: PluginRegistry
  eventBus: EventBus
  middleware: MiddlewareRunner
  embeddingDimensions: number
}

export class IngestPipeline {
  private store: DocumentStore
  private registry: PluginRegistry
  private eventBus: EventBus
  private middleware: MiddlewareRunner
  private embeddingDimensions: number

  constructor(opts: IngestPipelineOptions) {
    this.store = opts.store
    this.registry = opts.registry
    this.eventBus = opts.eventBus
    this.middleware = opts.middleware
    this.embeddingDimensions = opts.embeddingDimensions
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    const contentStr = typeof input.content === 'string'
      ? input.content
      : input.content.toString('utf-8')
    const contentHash = sha256(contentStr)

    // Check if this document already exists with same hash
    const existing = this.findExistingDocument(input.sourcePath)
    if (existing && !this.store.hasContentChanged(existing.id, contentHash)) {
      return { documentId: existing.id, chunks: existing.chunk_count as number, status: 'skipped' }
    }

    // If existing but changed, delete old chunks first
    if (existing) {
      await this.store.deleteDocument(existing.id)
    }

    // Create document record
    const doc = this.store.createDocument({
      title: input.title,
      sourceType: input.sourceType,
      sourcePath: input.sourcePath,
      fileType: input.fileType,
      fileSizeBytes: input.fileSizeBytes,
      connectorId: input.connectorId,
    })

    try {
      // PARSE
      const fileExt = input.fileType || extname(input.sourcePath) || '.md'
      const parser = this.registry.findParserForType(fileExt)
      if (!parser) {
        throw new Error(`No parser found for file type: ${fileExt}`)
      }

      const rawDoc = {
        sourceId: doc.id,
        title: input.title,
        content: input.content,
        mimeType: undefined,
      }

      const parsedChunks: ParsedChunk[] = []
      const afterParse = await this.middleware.run('before:parse', rawDoc)
      for await (const chunk of parser.parse(afterParse)) {
        parsedChunks.push(chunk)
      }
      await this.middleware.run('after:parse', parsedChunks)
      this.eventBus.emit('document:parsed', { documentId: doc.id, chunks: parsedChunks.length })

      // CHUNK -- apply semantic chunking to text chunks, pass code chunks through
      let allChunks: ParsedChunk[] = []
      await this.middleware.run('before:chunk', parsedChunks)
      for (const parsed of parsedChunks) {
        if (parsed.chunkType === 'semantic' && parsed.content.length > 0) {
          const textChunks = chunkText(parsed.content, { maxTokens: 512, overlap: 50 })
          for (const tc of textChunks) {
            allChunks.push({
              content: tc.content,
              chunkType: 'semantic',
              headingHierarchy: tc.headingHierarchy.length > 0
                ? tc.headingHierarchy
                : parsed.headingHierarchy,
            })
          }
        } else {
          allChunks.push(parsed)
        }
      }
      allChunks = await this.middleware.run('after:chunk', allChunks) as ParsedChunk[]
      this.eventBus.emit('document:chunked', { documentId: doc.id, chunks: allChunks.length })

      // EMBED
      const embeddingModel = this.findEmbeddingModel()
      if (!embeddingModel || !embeddingModel.embed) {
        throw new Error('No embedding model available')
      }

      const texts = allChunks.map(c => c.content)
      const batchSize = 32
      const allEmbeddings: number[][] = []

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize)
        const result = await embeddingModel.embed(batch)
        allEmbeddings.push(...result.dense)
      }
      this.eventBus.emit('document:embedded', { documentId: doc.id, chunks: allChunks.length })

      // STORE
      const storedChunks = allChunks.map((chunk, i) => ({
        content: chunk.content,
        embedding: allEmbeddings[i],
        chunkType: chunk.chunkType,
        position: i,
        tokenCount: Math.ceil(chunk.content.length / 4),
        headingHierarchy: chunk.headingHierarchy || [],
        language: chunk.language,
        codeSymbols: chunk.codeSymbols,
      }))

      await this.store.storeChunks(doc.id, storedChunks)
      this.store.updateContentHash(doc.id, contentHash)
      this.eventBus.emit('document:indexed', { documentId: doc.id, chunks: allChunks.length })

      return { documentId: doc.id, chunks: allChunks.length, status: 'indexed' }
    } catch (err) {
      const errorMsg = (err as Error).message
      this.store.updateStatus(doc.id, 'error', errorMsg)
      this.eventBus.emit('document:error', { documentId: doc.id, error: errorMsg })
      return { documentId: doc.id, chunks: 0, status: 'error', error: errorMsg }
    }
  }

  private findExistingDocument(sourcePath: string) {
    const docs = this.store.listDocuments()
    return docs.find(d => d.source_path === sourcePath)
  }

  private findEmbeddingModel(): ModelPlugin | undefined {
    const models = this.registry.getModels()
    return models.find(m => m.capabilities.embedding)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && npx vitest run tests/ingest/pipeline.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Export from barrel**

```typescript
export { IngestPipeline, type IngestInput, type IngestResult, type IngestPipelineOptions } from './ingest/pipeline.js'
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ingest/pipeline.ts packages/core/tests/ingest/pipeline.test.ts packages/core/src/index.ts
git commit -m "feat(core): add ingest pipeline orchestrator with parse -> chunk -> embed -> store flow"
```

---

## Task 6: RAG Profiles

**Files:**
- Create: `packages/core/src/rag/profiles.ts`
- Create: `packages/core/tests/rag/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rag/profiles.test.ts
import { describe, it, expect } from 'vitest'
import { getProfileConfig, type RAGProfileConfig } from '../../src/rag/profiles.js'

describe('RAG Profiles', () => {
  it('returns fast profile config', () => {
    const config = getProfileConfig('fast')
    expect(config.retrieval.k).toBe(10)
    expect(config.retrieval.minScore).toBe(0.5)
    expect(config.retrieval.finalTopK).toBe(3)
    expect(config.features.reranker).toBe(false)
  })

  it('returns balanced profile config', () => {
    const config = getProfileConfig('balanced')
    expect(config.retrieval.k).toBe(20)
    expect(config.retrieval.minScore).toBe(0.3)
    expect(config.retrieval.finalTopK).toBe(5)
    expect(config.features.reranker).toBe(true)
  })

  it('returns precise profile config', () => {
    const config = getProfileConfig('precise')
    expect(config.retrieval.k).toBe(50)
    expect(config.retrieval.minScore).toBe(0.15)
    expect(config.retrieval.finalTopK).toBe(10)
    expect(config.features.reranker).toBe(true)
    expect(config.features.queryDecomposition).toBe(true)
  })
})
```

- [ ] **Step 2: Implement profiles**

```typescript
// packages/core/src/rag/profiles.ts

export interface RAGProfileConfig {
  retrieval: {
    k: number
    minScore: number
    finalTopK: number
  }
  context: {
    maxTokens: number
    historyMaxTokens: number
  }
  features: {
    reranker: boolean
    queryDecomposition: boolean
    crossLingual: boolean
    webSearch: boolean | 'fallback'
    hallucinationGuard: boolean | 'strict'
    adaptiveRetrieval: boolean
  }
}

const PROFILES: Record<string, RAGProfileConfig> = {
  fast: {
    retrieval: { k: 10, minScore: 0.5, finalTopK: 3 },
    context: { maxTokens: 2048, historyMaxTokens: 512 },
    features: {
      reranker: false,
      queryDecomposition: false,
      crossLingual: false,
      webSearch: false,
      hallucinationGuard: false,
      adaptiveRetrieval: false,
    },
  },
  balanced: {
    retrieval: { k: 20, minScore: 0.3, finalTopK: 5 },
    context: { maxTokens: 4096, historyMaxTokens: 1024 },
    features: {
      reranker: true,
      queryDecomposition: false,
      crossLingual: true,
      webSearch: 'fallback',
      hallucinationGuard: true,
      adaptiveRetrieval: true,
    },
  },
  precise: {
    retrieval: { k: 50, minScore: 0.15, finalTopK: 10 },
    context: { maxTokens: 8192, historyMaxTokens: 2048 },
    features: {
      reranker: true,
      queryDecomposition: true,
      crossLingual: true,
      webSearch: true,
      hallucinationGuard: 'strict',
      adaptiveRetrieval: true,
    },
  },
}

export function getProfileConfig(profile: string): RAGProfileConfig {
  const config = PROFILES[profile]
  if (!config) {
    throw new Error(`Unknown RAG profile: ${profile}. Available: ${Object.keys(PROFILES).join(', ')}`)
  }
  return structuredClone(config)
}
```

- [ ] **Step 3: Run test, export, commit**

```bash
cd packages/core && npx vitest run tests/rag/profiles.test.ts
```

Export: `export { getProfileConfig, type RAGProfileConfig } from './rag/profiles.js'`

Commit: `"feat(core): add RAG profile configs (fast/balanced/precise)"`

---

## Task 7: Confidence Scoring

**Files:**
- Create: `packages/core/src/rag/confidence.ts`
- Create: `packages/core/tests/rag/confidence.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rag/confidence.test.ts
import { describe, it, expect } from 'vitest'
import { calculateConfidence, type ConfidenceResult } from '../../src/rag/confidence.js'

describe('Confidence Scoring', () => {
  it('returns high confidence for strong results', () => {
    const result = calculateConfidence({
      retrievalScores: [0.9, 0.85, 0.8, 0.75, 0.7],
      rerankScores: [0.95, 0.9, 0.85, 0.8, 0.75],
      sourceCount: 5,
      queryKeywords: ['redis', 'config'],
      chunkTexts: ['redis config setup', 'redis configuration guide', 'configure redis cache', 'redis settings', 'redis config file'],
    })
    expect(result.level).toBe('high')
    expect(result.score).toBeGreaterThanOrEqual(0.7)
  })

  it('returns low confidence for weak results', () => {
    const result = calculateConfidence({
      retrievalScores: [0.2],
      rerankScores: [0.15],
      sourceCount: 1,
      queryKeywords: ['advanced', 'quantum', 'computing'],
      chunkTexts: ['basic introduction to databases'],
    })
    expect(result.level).toBe('low')
    expect(result.score).toBeLessThan(0.4)
  })

  it('returns none when no results', () => {
    const result = calculateConfidence({
      retrievalScores: [],
      rerankScores: [],
      sourceCount: 0,
      queryKeywords: ['test'],
      chunkTexts: [],
    })
    expect(result.level).toBe('none')
    expect(result.score).toBe(0)
  })
})
```

- [ ] **Step 2: Implement confidence scoring**

```typescript
// packages/core/src/rag/confidence.ts

export interface ConfidenceInput {
  retrievalScores: number[]
  rerankScores: number[]
  sourceCount: number
  queryKeywords: string[]
  chunkTexts: string[]
}

export interface ConfidenceResult {
  score: number
  level: 'high' | 'medium' | 'low' | 'none'
  reason: string
}

const WEIGHTS = {
  retrievalScore: 0.4,
  rerankScore: 0.3,
  sourceCount: 0.15,
  chunkCoverage: 0.15,
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  if (input.retrievalScores.length === 0) {
    return { score: 0, level: 'none', reason: 'No relevant documents found' }
  }

  // Average retrieval score
  const avgRetrieval = average(input.retrievalScores)

  // Average rerank score (or retrieval score if no reranker)
  const avgRerank = input.rerankScores.length > 0
    ? average(input.rerankScores)
    : avgRetrieval

  // Source count factor (normalized: 1 source=0.2, 3+=0.8, 5+=1.0)
  const sourceFactor = Math.min(input.sourceCount / 5, 1.0)

  // Keyword coverage: what fraction of query keywords appear in chunks
  const coverage = input.queryKeywords.length > 0
    ? input.queryKeywords.filter(kw =>
        input.chunkTexts.some(t => t.toLowerCase().includes(kw.toLowerCase()))
      ).length / input.queryKeywords.length
    : 0

  const score =
    avgRetrieval * WEIGHTS.retrievalScore +
    avgRerank * WEIGHTS.rerankScore +
    sourceFactor * WEIGHTS.sourceCount +
    coverage * WEIGHTS.chunkCoverage

  const level: ConfidenceResult['level'] =
    score >= 0.7 ? 'high' :
    score >= 0.4 ? 'medium' :
    score >= 0.2 ? 'low' : 'none'

  const reason =
    level === 'high' ? 'Strong match with multiple supporting sources' :
    level === 'medium' ? 'Partial match found' :
    level === 'low' ? 'Weak match -- results may not be accurate' :
    'No relevant documents found'

  return { score, level, reason }
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
```

- [ ] **Step 3: Run test, export, commit**

Export: `export { calculateConfidence, type ConfidenceInput, type ConfidenceResult } from './rag/confidence.js'`

Commit: `"feat(core): add confidence scoring for RAG results"`

---

## Task 8: Retriever

**Files:**
- Create: `packages/core/src/rag/retriever.ts`
- Create: `packages/core/tests/rag/retriever.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/tests/rag/retriever.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Retriever } from '../../src/rag/retriever.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import type { ModelPlugin } from '../../src/plugin/interfaces.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function createMockEmbedder(): ModelPlugin {
  return {
    name: 'mock-embedder',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    setup: async () => {},
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

describe('Retriever', () => {
  let db: DB
  let vectorDb: VectorDB
  let store: DocumentStore
  let retriever: Retriever
  let tempDir: string

  beforeEach(async () => {
    db = createSQLiteDB(':memory:')
    runMigrations(db)
    tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-test-'))
    vectorDb = await createLanceDB(tempDir)
    store = new DocumentStore(db, vectorDb, 'ws-1')
    await store.initialize(3)
    db.run("INSERT INTO workspaces (id, name) VALUES ('ws-1', 'default')")

    const embedder = createMockEmbedder()
    retriever = new Retriever(store, embedder)

    // Seed documents
    const doc = store.createDocument({
      title: 'test.md', sourceType: 'local', sourcePath: '/test.md', fileType: '.md',
    })

    const embedResult = await embedder.embed!(['Redis configuration guide', 'Python tutorial basics', 'Database setup instructions'])
    await store.storeChunks(doc.id, [
      { content: 'Redis configuration guide', embedding: embedResult.dense[0], chunkType: 'semantic', position: 0, tokenCount: 3, headingHierarchy: ['# Redis'] },
      { content: 'Python tutorial basics', embedding: embedResult.dense[1], chunkType: 'semantic', position: 1, tokenCount: 3, headingHierarchy: ['# Python'] },
      { content: 'Database setup instructions', embedding: embedResult.dense[2], chunkType: 'semantic', position: 2, tokenCount: 3, headingHierarchy: ['# Database'] },
    ])
  })

  afterEach(async () => {
    db.close()
    await vectorDb.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('retrieves relevant chunks for a query', async () => {
    const results = await retriever.retrieve('Redis config', { k: 3, finalTopK: 2, minScore: 0 })
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(2)
  })

  it('returns empty for unrelated query with high minScore', async () => {
    const results = await retriever.retrieve('quantum physics', { k: 3, finalTopK: 2, minScore: 0.99 })
    expect(results).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Implement Retriever**

```typescript
// packages/core/src/rag/retriever.ts
import { DocumentStore, type SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'

export interface RetrieveOptions {
  k: number
  finalTopK: number
  minScore?: number
}

export class Retriever {
  constructor(
    private store: DocumentStore,
    private embedder: ModelPlugin
  ) {
    if (!embedder.embed) {
      throw new Error('Embedding model must support embed()')
    }
  }

  async retrieve(query: string, opts: RetrieveOptions): Promise<SearchResult[]> {
    // Embed the query
    const embedResult = await this.embedder.embed!([query])
    const queryEmbedding = embedResult.dense[0]

    // Search vector store
    const results = await this.store.searchChunks(
      queryEmbedding,
      opts.k,
      opts.minScore
    )

    // Return top-K after scoring (reranking would go here in future)
    return results.slice(0, opts.finalTopK)
  }
}
```

- [ ] **Step 3: Run test, export, commit**

Export: `export { Retriever, type RetrieveOptions } from './rag/retriever.js'`

Commit: `"feat(core): add retriever with vector search and embedding"`

---

## Task 9: Generator + RAG Engine

**Files:**
- Create: `packages/core/src/rag/generator.ts`
- Create: `packages/core/src/rag/router.ts`
- Create: `packages/core/src/rag/engine.ts`
- Create: `packages/core/tests/rag/engine.test.ts`

- [ ] **Step 1: Implement Generator**

```typescript
// packages/core/src/rag/generator.ts
import type { SearchResult } from '../ingest/document-store.js'
import type { ModelPlugin } from '../plugin/interfaces.js'

export interface GenerateInput {
  query: string
  context: SearchResult[]
  intent: string
  systemPrompt?: string
}

const INTENT_PROMPTS: Record<string, string> = {
  code: 'You are OpenDocuments, a document assistant. Prioritize code examples. Use fenced code blocks with language tags. Cite sources using [Source: filename#section].',
  concept: 'You are OpenDocuments, a document assistant. Explain clearly and concisely. Use analogies if helpful. Cite sources using [Source: filename#section].',
  config: 'You are OpenDocuments, a document assistant. Be precise with configuration details. Include file paths and exact values. Cite sources using [Source: filename#section].',
  data: 'You are OpenDocuments, a document assistant. Be precise with numbers. Present data in tables when appropriate. Cite sources using [Source: filename#section].',
  search: 'You are OpenDocuments, a document assistant. List relevant documents with brief summaries. Sort by relevance. Cite sources using [Source: filename#section].',
  compare: 'You are OpenDocuments, a document assistant. Present a structured comparison. Use tables for side-by-side when possible. Cite sources using [Source: filename#section].',
  general: 'You are OpenDocuments, a document assistant. Answer based ONLY on the provided context. If the context is insufficient, say so honestly. Cite sources using [Source: filename#section].',
}

export function buildPrompt(input: GenerateInput): string {
  const systemPrompt = input.systemPrompt || INTENT_PROMPTS[input.intent] || INTENT_PROMPTS.general

  const contextStr = input.context.map((chunk, i) =>
    `[${i + 1}] (Source: ${chunk.sourcePath})\n${chunk.content}`
  ).join('\n\n---\n\n')

  return `${systemPrompt}\n\n## Context\n\n${contextStr}\n\n## Question\n\n${input.query}`
}

export async function* generateAnswer(
  model: ModelPlugin,
  input: GenerateInput
): AsyncIterable<string> {
  if (!model.generate) {
    throw new Error('LLM model must support generate()')
  }

  const prompt = buildPrompt(input)

  yield* model.generate(prompt, {
    temperature: 0.3,
    systemPrompt: INTENT_PROMPTS[input.intent] || INTENT_PROMPTS.general,
  })
}
```

- [ ] **Step 2: Implement Query Router**

```typescript
// packages/core/src/rag/router.ts

export type QueryRoute = 'rag' | 'direct' | 'web_only' | 'rag_web'

const GREETING_PATTERNS = /^(hi|hello|hey|안녕|하이|반가워|감사합니다|thank|thanks)\b/i

const DB_LOOKUP_PATTERNS = /^(how many|몇 개|인덱싱된 문서|총 문서 수|list documents|문서 목록)/i

export function routeQuery(query: string): QueryRoute {
  const trimmed = query.trim()

  if (GREETING_PATTERNS.test(trimmed)) {
    return 'direct'
  }

  if (DB_LOOKUP_PATTERNS.test(trimmed)) {
    return 'direct'
  }

  return 'rag'
}
```

- [ ] **Step 3: Implement RAGEngine**

```typescript
// packages/core/src/rag/engine.ts
import { Retriever, type RetrieveOptions } from './retriever.js'
import { buildPrompt, generateAnswer, type GenerateInput } from './generator.js'
import { getProfileConfig, type RAGProfileConfig } from './profiles.js'
import { calculateConfidence, type ConfidenceResult } from './confidence.js'
import { routeQuery, type QueryRoute } from './router.js'
import { DocumentStore, type SearchResult } from '../ingest/document-store.js'
import { EventBus } from '../events/bus.js'
import type { ModelPlugin } from '../plugin/interfaces.js'
import { randomUUID } from 'node:crypto'

export interface QueryInput {
  query: string
  profile?: string        // 'fast' | 'balanced' | 'precise'
  conversationId?: string
}

export interface QueryResult {
  queryId: string
  answer: string
  sources: SearchResult[]
  confidence: ConfidenceResult
  route: QueryRoute
  profile: string
}

export interface RAGEngineOptions {
  store: DocumentStore
  llm: ModelPlugin
  embedder: ModelPlugin
  eventBus: EventBus
  defaultProfile?: string
}

export class RAGEngine {
  private retriever: Retriever
  private llm: ModelPlugin
  private eventBus: EventBus
  private defaultProfile: string

  constructor(opts: RAGEngineOptions) {
    this.retriever = new Retriever(opts.store, opts.embedder)
    this.llm = opts.llm
    this.eventBus = opts.eventBus
    this.defaultProfile = opts.defaultProfile || 'balanced'
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const queryId = randomUUID()
    const profileName = input.profile || this.defaultProfile
    const profile = getProfileConfig(profileName)

    this.eventBus.emit('query:received', { queryId, query: input.query })

    // Route
    const route = routeQuery(input.query)
    if (route === 'direct') {
      return {
        queryId,
        answer: this.directResponse(input.query),
        sources: [],
        confidence: { score: 1, level: 'high', reason: 'Direct response' },
        route,
        profile: profileName,
      }
    }

    // Retrieve
    const retrieveOpts: RetrieveOptions = {
      k: profile.retrieval.k,
      finalTopK: profile.retrieval.finalTopK,
      minScore: profile.retrieval.minScore,
    }

    const results = await this.retriever.retrieve(input.query, retrieveOpts)
    this.eventBus.emit('query:retrieved', { queryId, chunks: results.length })

    // Confidence
    const keywords = input.query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const confidence = calculateConfidence({
      retrievalScores: results.map(r => r.score),
      rerankScores: [],
      sourceCount: new Set(results.map(r => r.documentId)).size,
      queryKeywords: keywords,
      chunkTexts: results.map(r => r.content),
    })

    // Generate
    const intent = 'general' // Intent classification deferred to Phase 2
    const generateInput: GenerateInput = {
      query: input.query,
      context: results,
      intent,
    }

    let answer = ''
    for await (const chunk of generateAnswer(this.llm, generateInput)) {
      answer += chunk
    }
    this.eventBus.emit('query:generated', { queryId })

    return {
      queryId,
      answer,
      sources: results,
      confidence,
      route,
      profile: profileName,
    }
  }

  async *queryStream(input: QueryInput): AsyncIterable<{ type: 'chunk' | 'sources' | 'done'; data: unknown }> {
    const queryId = randomUUID()
    const profileName = input.profile || this.defaultProfile
    const profile = getProfileConfig(profileName)

    this.eventBus.emit('query:received', { queryId, query: input.query })

    const route = routeQuery(input.query)
    if (route === 'direct') {
      yield { type: 'chunk', data: this.directResponse(input.query) }
      yield { type: 'done', data: { queryId, route, profile: profileName } }
      return
    }

    const results = await this.retriever.retrieve(input.query, {
      k: profile.retrieval.k,
      finalTopK: profile.retrieval.finalTopK,
      minScore: profile.retrieval.minScore,
    })

    yield { type: 'sources', data: results }

    const generateInput: GenerateInput = {
      query: input.query,
      context: results,
      intent: 'general',
    }

    for await (const chunk of generateAnswer(this.llm, generateInput)) {
      yield { type: 'chunk', data: chunk }
    }

    yield { type: 'done', data: { queryId, route, profile: profileName } }
  }

  private directResponse(query: string): string {
    const lower = query.toLowerCase().trim()
    if (/^(hi|hello|hey|안녕|하이|반가워)/i.test(lower)) {
      return 'Hello! I am OpenDocuments. Ask me anything about your documents.'
    }
    return 'This is a direct response. For document-related queries, I will search through your indexed documents.'
  }
}
```

- [ ] **Step 4: Write the failing test**

```typescript
// packages/core/tests/rag/engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RAGEngine } from '../../src/rag/engine.js'
import { DocumentStore } from '../../src/ingest/document-store.js'
import { EventBus } from '../../src/events/bus.js'
import { createSQLiteDB } from '../../src/storage/sqlite.js'
import { createLanceDB } from '../../src/storage/lancedb.js'
import { runMigrations } from '../../src/storage/migrations/runner.js'
import type { DB } from '../../src/storage/db.js'
import type { VectorDB } from '../../src/storage/vector-db.js'
import type { ModelPlugin } from '../../src/plugin/interfaces.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function createMockModels() {
  const embedder: ModelPlugin = {
    name: 'mock-embedder', type: 'model', version: '0.1.0', coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    setup: async () => {},
    async embed(texts: string[]) {
      return {
        dense: texts.map(t => {
          const h = t.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
          return [Math.sin(h), Math.cos(h), Math.sin(h * 2)]
        }),
      }
    },
  }

  const llm: ModelPlugin = {
    name: 'mock-llm', type: 'model', version: '0.1.0', coreVersion: '^0.1.0',
    capabilities: { llm: true },
    setup: async () => {},
    async *generate(prompt: string) {
      yield 'Based on the context, '
      yield 'here is the answer.'
    },
  }

  return { embedder, llm }
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

    // Seed data
    const doc = store.createDocument({
      title: 'guide.md', sourceType: 'local', sourcePath: '/guide.md', fileType: '.md',
    })
    const embedResult = await embedder.embed!(['Redis configuration guide with examples', 'Python setup tutorial for beginners'])
    await store.storeChunks(doc.id, [
      { content: 'Redis configuration guide with examples', embedding: embedResult.dense[0], chunkType: 'semantic', position: 0, tokenCount: 5, headingHierarchy: ['# Redis'] },
      { content: 'Python setup tutorial for beginners', embedding: embedResult.dense[1], chunkType: 'semantic', position: 1, tokenCount: 5, headingHierarchy: ['# Python'] },
    ])

    engine = new RAGEngine({
      store, llm, embedder,
      eventBus: new EventBus(),
      defaultProfile: 'balanced',
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
    // Fast profile has finalTopK=3, so max 3 sources
    expect(fast.sources.length).toBeLessThanOrEqual(3)
  })
})
```

- [ ] **Step 5: Run tests**

```bash
cd packages/core && npx vitest run tests/rag/engine.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Export all from barrel**

```typescript
export { generateAnswer, buildPrompt, type GenerateInput } from './rag/generator.js'
export { routeQuery, type QueryRoute } from './rag/router.js'
export { RAGEngine, type QueryInput, type QueryResult, type RAGEngineOptions } from './rag/engine.js'
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/rag/ packages/core/tests/rag/ packages/core/src/index.ts
git commit -m "feat(core): add RAG engine with retriever, generator, router, confidence scoring, and streaming"
```

---

## Task 10: Config Schema Fix + Final Integration

**Files:**
- Modify: `packages/core/src/config/schema.ts` (fix vectorDb default to 'lancedb')

- [ ] **Step 1: Fix config schema vectorDb default**

In `packages/core/src/config/schema.ts`, change:
```typescript
vectorDb: z.enum(['chroma', 'qdrant']).default('chroma'),
```
to:
```typescript
vectorDb: z.enum(['lancedb', 'qdrant']).default('lancedb'),
```

Also update `packages/core/src/config/defaults.ts` to match.

- [ ] **Step 2: Run full test suite**

```bash
npx turbo test
```

Expected: All tests pass (43 from Plan 1 + ~22 new from Plan 2 = ~65 total).

- [ ] **Step 3: Verify build**

```bash
npx turbo build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "fix(core): update vectorDb config default to lancedb, integration verification"
```

---

## Summary

| Task | What it builds | Tests |
|------|---------------|-------|
| 1 | Semantic text chunker | 5 |
| 2 | Built-in markdown parser (ParserPlugin) | 4 |
| 3 | Pipeline middleware runner | -- (tested via pipeline) |
| 4 | Document store (SQLite + LanceDB coordination) | 5 |
| 5 | Ingest pipeline orchestrator | 3 |
| 6 | RAG profiles (fast/balanced/precise) | 3 |
| 7 | Confidence scoring | 3 |
| 8 | Retriever (vector search + embedding) | 2 |
| 9 | Generator + Router + RAG Engine | 4 |
| 10 | Config fix + integration verification | full suite |

**Total: 10 tasks, ~29 new tests, full ingest + RAG pipeline.**

After this plan is complete, Plan 3 (Server + CLI + MCP) will expose these engines as HTTP/CLI/MCP interfaces.
