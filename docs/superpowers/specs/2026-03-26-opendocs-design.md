# OpenDocs -- Design Specification

> **Version:** 1.0.0
> **Date:** 2026-03-26
> **Status:** Approved

---

## 1. Project Overview

| Item | Detail |
|------|--------|
| **Name** | OpenDocs |
| **npm package** | `opendocs` (available), scoped: `@opendocs/*` |
| **One-liner** | A self-hosted open-source RAG platform that unifies scattered organizational documents and answers natural language queries with accurate, source-cited responses |
| **Purpose** | Production-grade open-source project with real daily usage value |
| **Target users** | Individual developers, small teams, enterprise teams, open-source maintainers |
| **License** | MIT |
| **Runtime** | Node.js (TypeScript) -- single runtime for all components |
| **Install** | `npm install -g @opendocs/cli` |

### Key Differentiators from Original PRD

| Item | PRD (original) | Design (this doc) |
|------|---------------|-------------------|
| **Name** | DocuMind | OpenDocs |
| **Positioning** | Tech docs RAG | All organizational documents RAG platform |
| **Runtime** | Python (FastAPI + Celery) | Node.js (TypeScript) unified |
| **Interfaces** | Web UI only | Web UI + CLI + MCP (full API mirror) |
| **Installation** | Docker Compose | `npm install -g @opendocs/cli` + interactive init |
| **Model** | Ollama only (Qwen 3.5) | Local/Cloud selectable at install time |
| **Infrastructure** | PostgreSQL + Redis + Qdrant | Default: SQLite + ChromaDB (zero deps) / Production: Docker Compose |
| **Auth** | Phase 3 | MVP: multi-workspace (personal mode default) |
| **Sync** | Varies per connector | Real-time where possible (watch/webhook), polling fallback for APIs without push support |
| **Connector strategy** | Self-implemented | MCP client first, self-implement only when no MCP available |
| **File formats** | 7 types | MVP 15+, final 25+ (including media STT/OCR) |
| **Web search** | None | Real-time web search (Tavily/SearXNG) |
| **Internal sites** | None | URL registration + periodic crawling |

---

## 2. Architecture Overview

```
+-----------------------------------------------------------+
|                    @opendocs/cli                           |
|              (init, start, index, ask, plugin)             |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                   @opendocs/server                         |
|          REST API + WebSocket + MCP Server                 |
|         (Hono -- lightweight, edge-compatible HTTP)         |
+---------+--------------+----------------------------------+
|  HTTP   |  WebSocket   |  MCP (stdio + SSE)               |
|  /api/* |  /ws/chat    |  tools: search, index, ask...    |
+---------+--------------+----------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                   @opendocs/core                           |
+-----------------------------------------------------------+
|                                                            |
|  +-----------+  +-----------+  +------------+              |
|  | Ingest    |  |   RAG     |  |  Model     |              |
|  | Engine    |  |  Engine   |  |  Manager   |              |
|  +-----+-----+  +-----+-----+  +-----+------+             |
|        |              |              |                      |
|  +-----+-----+  +-----+-----+  +-----+------+             |
|  | Plugin    |  | Storage   |  | Provider   |              |
|  | Registry  |  | Layer     |  | Registry   |              |
|  |           |  |           |  |            |              |
|  | parsers   |  | SQLite/   |  | ollama     |              |
|  | connectors|  | PG        |  | openai     |              |
|  | hooks     |  | Chroma/   |  | anthropic  |              |
|  | middleware|  | Qdrant    |  | google     |              |
|  +-----------+  +-----------+  +------------+              |
|                                                            |
|  +------------+  +------------+  +------------+            |
|  | Event Bus  |  | Security   |  | Telemetry  |            |
|  +------------+  +------------+  +------------+            |
|                                                            |
+-----------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------+
|                   @opendocs/web                            |
|          React SPA (built assets served by server)         |
|          Chat / Docs / Connectors / Admin Dashboard        |
+-----------------------------------------------------------+
```

### Core Design Principles

1. **Plugin Registry is central** -- connectors, parsers, model providers, middleware all register via the same plugin interface. `@opendocs/core` ships with built-in markdown and txt parsers only; all other capabilities come from plugins that are auto-installed during `opendocs init`.
2. **Storage Layer abstraction** -- SQLite/PostgreSQL, Chroma/Qdrant behind identical interfaces. Switch by config only. Note: ChromaDB does not support sparse vectors natively; in ChromaDB mode, sparse/lexical search is implemented via SQLite FTS5 full-text search as a fallback. Qdrant mode uses native sparse vector support for best hybrid search quality.
3. **Server is a thin routing layer** -- all business logic in core. Server handles HTTP/WS/MCP protocol translation only.
4. **Web is a build artifact** -- `opendocs start` serves pre-built React app as static files. No separate frontend server.
5. **Event Bus for decoupling** -- plugins communicate through events, not direct calls.
6. **Config as Code** -- `opendocs.config.ts` is the single source of truth, version-controllable via git.

---

## 3. Plugin System

### 3.1 Plugin Types

```typescript
type PluginType = 'connector' | 'parser' | 'model' | 'middleware'
```

| Type | Role | Examples |
|------|------|---------|
| **connector** | Fetch documents from external sources | github, notion, gdrive, mcp, web-crawler |
| **parser** | Convert files to text/chunks | pdf, hwp, docx, pptx, code-ast |
| **model** | LLM/embedding/reranker providers | ollama, openai, anthropic, google |
| **middleware** | Hook into pipelines to extend behavior | term expansion, weight adjustment, logging |

### 3.2 Plugin Interfaces

```typescript
// Common interface for all plugins
interface OpenDocsPlugin {
  name: string
  type: PluginType
  version: string
  coreVersion: string               // required core version (semver)
  dependencies?: string[]           // required other plugins
  conflicts?: string[]              // conflicting plugins
  configSchema: JSONSchema          // for auto-generated Web UI forms

  setup(ctx: PluginContext): Promise<void>
  teardown?(): Promise<void>
  healthCheck?(): Promise<HealthStatus>
  metrics?(): Promise<PluginMetrics>

  migrations?: {
    from: string
    migrate: (oldConfig: any) => any
  }[]
}

// Connector plugin
interface ConnectorPlugin extends OpenDocsPlugin {
  type: 'connector'
  discover(): AsyncIterable<DiscoveredDocument>
  fetch(docRef: DocumentRef): Promise<RawDocument>
  watch?(onChange: (event: ChangeEvent) => void): Promise<Disposable>
  auth?(): Promise<AuthResult>
}

// Parser plugin
interface ParserPlugin extends OpenDocsPlugin {
  type: 'parser'
  supportedTypes: string[]
  multimodal?: boolean
  parse(raw: RawDocument): AsyncIterable<ParsedChunk>
}

// Model plugin
interface ModelPlugin extends OpenDocsPlugin {
  type: 'model'
  capabilities: {
    llm?: boolean
    embedding?: boolean
    reranker?: boolean
    vision?: boolean
  }
  generate?(prompt: string, opts: GenerateOpts): AsyncIterable<string>
  embed?(texts: string[]): Promise<EmbeddingResult>
  rerank?(query: string, docs: string[]): Promise<RerankResult>
  describeImage?(image: Buffer): Promise<string>
}

// Middleware plugin
interface MiddlewarePlugin extends OpenDocsPlugin {
  type: 'middleware'
  hooks: {
    stage: PipelineStage    // 'before:discover' | 'after:discover' | 'before:parse' | 'after:parse' |
                            // 'before:chunk' | 'after:chunk' | 'before:retrieve' | 'after:retrieve' |
                            // 'before:rerank' | 'after:rerank' | 'before:generate' | 'after:generate' |
                            // 'before:query' | 'after:query'
    handler: (data: any) => Promise<any>
  }[]
}
```

### 3.3 Plugin Permissions (Sandboxing)

```typescript
interface PluginPermissions {
  network?: boolean | string[]
  filesystem?: boolean | string[]
  env?: string[]
  events?: string[]
}
```

Community plugins prompt the user for permission approval on install. Sandboxing is enforced via Node.js worker threads with restricted `env` access and network interception (using `undici` dispatcher hooks). Filesystem access is limited to declared paths via `fs` proxy. This is a best-effort sandbox, not a security boundary -- the permission declaration serves as transparency for users.

### 3.4 Plugin Naming Convention

Official scoped packages use type-specific prefixes:
- Connectors: `@opendocs/plugin-<service>` (e.g., `@opendocs/plugin-github`)
- Parsers: `@opendocs/parser-<format>` (e.g., `@opendocs/parser-pdf`)
- Models: `@opendocs/model-<provider>` (e.g., `@opendocs/model-ollama`)
- Middleware: `@opendocs/middleware-<name>`

Community plugins use unscoped names with `opendocs-` prefix:
- `opendocs-plugin-jira`, `opendocs-parser-epub`, `opendocs-model-together`

### 3.5 Plugin Dev Kit

```bash
opendocs plugin create <name>    # scaffold boilerplate
opendocs plugin test             # interface compliance test
opendocs plugin dev              # hot-reload linked to local OpenDocs
opendocs plugin publish          # npm publish + registry
```

### 3.6 Plugin Marketplace CLI

```bash
opendocs plugin search <keyword>  # search npm registry for opendocs-plugin-*
```

Displays: compatibility, weekly downloads, rating, official/community badge.

### 3.7 Plugin Presets

```
opendocs init
  [??] Select a preset:
       > Developer    -- GitHub, Swagger, code parser, Markdown
         Enterprise   -- Google Drive, Notion, Confluence, HWP, PDF, DOCX
         All          -- all connectors + all parsers
         Custom       -- pick individually
```

### 3.8 Parser Fallback Chain

```typescript
parserFallbacks: {
  '.hwp': ['@opendocs/parser-hwp', '@opendocs/parser-libreoffice', '@opendocs/parser-ocr'],
  '.pdf': ['@opendocs/parser-pdf', '@opendocs/parser-ocr'],
}
```

### 3.9 Plugin Hot Reload

```bash
opendocs plugin add @opendocs/plugin-confluence --hot    # no server restart
opendocs plugin remove @opendocs/plugin-confluence --hot
```

### 3.10 Plugin Config Migration

Plugins declare `migrations[]` for automatic config schema migration on update.

### 3.11 Event Bus Events

```typescript
// Document lifecycle
'document:discovered' | 'document:fetched' | 'document:parsed'
'document:chunked' | 'document:embedded' | 'document:indexed'
'document:deleted' | 'document:error'

// Query lifecycle
'query:received' | 'query:parsed' | 'query:retrieved'
'query:reranked' | 'query:generated' | 'query:feedback'

// System
'connector:sync:started' | 'connector:sync:completed'
'plugin:loaded' | 'plugin:error'
'server:started'
```

---

## 4. Ingest Pipeline

### 4.1 Pipeline Stages

```
1. DISCOVER  -- connector finds documents
   event: 'document:discovered'
   middleware: before:discover / after:discover

2. FETCH     -- retrieve raw content
   event: 'document:fetched'
   - content_hash (SHA-256) comparison -> skip if unchanged
   - archives (.zip) -> extract + re-enter each file

3. PARSE     -- file -> text
   event: 'document:parsed'
   middleware: before:parse / after:parse
   - Parser Registry matches by extension/MIME
   - Fallback Chain: primary fails -> try secondary
   - Multimodal: images -> OCR + Vision LLM (parallel)

4. CHUNK     -- text -> chunks
   event: 'document:chunked'
   middleware: before:chunk / after:chunk

5. EMBED     -- chunks -> vectors
   event: 'document:embedded'
   - Dense + Sparse simultaneous (BGE-M3)
   - Batch: 32 chunks at a time
   - Multimodal: image chunks -> Jina-CLIP-v2

6. STORE     -- vector DB + metadata DB
   event: 'document:indexed'
   - Vectors -> Chroma/Qdrant
   - Metadata -> SQLite/PostgreSQL
   - Transaction: both succeed or rollback
```

### 4.2 Chunking Strategies

| Content Type | Strategy | Split Criteria | Metadata |
|-------------|----------|---------------|----------|
| **Plain text** | semantic | paragraph/section boundary, 512 tokens, 50 token overlap | heading hierarchy, position |
| **Code block** | code-ast | tree-sitter AST -> function/class units | language, function name, imports |
| **Code+doc mixed** | semantic + code-ast | code block context attached to surrounding text | merged metadata |
| **Table** | table | header + N rows (max 512 tokens) | table title, column names |
| **API endpoint** | api-endpoint | 1 endpoint = 1 chunk | path, method, params |
| **Slide** | slide | 1 slide = 1 chunk | slide number, title |
| **Image** | multimedia | OCR text + Vision description = 1 chunk | source path, type |
| **Audio/Video** | multimedia | Whisper STT -> time-segmented chunks | timestamp, source path |

### 4.3 Chunk Metadata Schema

```typescript
interface ChunkMetadata {
  chunk_id: string
  document_id: string
  workspace_id: string
  source_type: string
  source_path: string
  connector_id?: string
  chunk_type: ChunkStrategy
  language?: string
  heading_hierarchy: string[]
  code_symbols?: string[]
  code_imports?: string[]
  position: number
  page?: number
  timestamp?: string
  token_count: number
  content_hash: string
  created_at: string
  updated_at: string
}
```

### 4.4 Change Detection & Incremental Indexing

- SHA-256 content hash comparison
- If changed: delete all existing chunks/vectors -> full re-process
- Full reprocess (not diff) because chunk boundaries shift and embeddings depend on surrounding context

### 4.5 Concurrency Control

```typescript
const ingestPool = new WorkerPool({
  maxWorkers: Math.max(1, os.cpus().length - 1),
  priority: {
    'file-upload': 10,      // user-uploaded = highest
    'watch-change': 8,      // real-time change detection
    'manual-sync': 5,       // manual sync trigger
    'scheduled-sync': 2,    // scheduled sync
  }
})
```

### 4.6 Multimodal Processing

- **Default:** OCR (Tesseract) for text extraction from images
- **Optional:** OCR + Vision LLM in parallel, results merged for richer text
- **Performance warning:** Vision LLM is resource-intensive; `opendocs init` recommends based on system specs. Low-spec systems prompted with warning before enabling.

### 4.7 Security -- Cloud Processing Policy

```typescript
security: {
  dataPolicy: {
    allowCloudProcessing: true,
    autoRedact: {
      enabled: true,
      patterns: ['email', 'phone', 'resident-id', 'credit-card', 'ip-address'],
      method: 'replace',
      replacement: '[REDACTED]',
    },
    sourceRestrictions: {
      localOnly: ['connector:google-drive'],
      cloudAllowed: ['connector:github'],
    },
    workspaceOverrides: {
      'hr-docs': { allowCloudProcessing: false },
    },
  },
  transport: {
    enforceHTTPS: true,
    allowedEndpoints: ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'],
  },
  storage: {
    encryptAtRest: false,
    redactLogsContent: true,
  },
  audit: {
    enabled: true,
    events: ['cloud:data-sent', 'document:accessed', 'auth:login', 'config:changed', 'plugin:installed'],
    destination: 'local',
  },
}
```

---

## 5. RAG Engine

### 5.1 Pipeline

```
User Query
  |
  v
1. QUERY ROUTE -- not all queries need RAG
   - greeting        -> direct response (skip RAG)
   - db lookup       -> DB query (skip RAG)
   - web-only        -> web search only
   - rag             -> full RAG pipeline
   - rag+web         -> RAG + web search merge

2. QUERY PARSE -- intent classification + preprocessing
   Intents: code | concept | config | data | search | compare
   Processing: typo correction, abbreviation expansion (middleware),
               multi-turn context merge, filter extraction

3. RETRIEVE -- hybrid search
   Dense (cosine, k=20) + Sparse (lexical, k=20)
   -> RRF merge -> top-20
   + Real-time web search (when applicable, Tavily/SearXNG)
   + Cross-Lingual query expansion (ko/en/original)

4. RERANK -- cross-encoder (bge-reranker-v2-m3)
   top-20 -> top-5
   Intent-based weight adjustment:
     code query -> boost code chunks
     data query -> boost table/spreadsheet chunks
     compare    -> boost same-topic different-version chunks

5. GENERATE -- LLM answer generation
   Intent-specific prompt templates
   Streaming response (SSE/WebSocket)
   Source citation cards

6. POST-PROCESS
   - Confidence scoring (retrieval score, rerank score, source count, coverage)
   - Hallucination guard (verify each sentence against sources)
   - Context Window Manager (smart allocation per model capacity)
```

### 5.2 RAG Profiles

| Setting | fast | balanced | precise | custom |
|---------|------|----------|---------|--------|
| Initial k | 10 | 20 | 50 | user-defined |
| Min similarity | 0.5 | 0.3 | 0.15 | user-defined |
| Final top-K | 3 | 5 | 10 | user-defined |
| Context tokens | 2048 | 4096 | 8192+ | user-defined |
| History tokens | 512 | 1024 | 2048 | user-defined |
| Reranker | off | on | on | toggle |
| Query decomposition | off | off | on | toggle |
| Cross-lingual | off | on | on | toggle |
| Web search | off | fallback (only when RAG results insufficient) | always merge with RAG | toggle |
| Hallucination guard | off | on | strict | toggle |
| Adaptive retrieval | off | on | on | toggle |
| **Best for** | low-spec, 8B models | general, 14B-32B | high-spec, cloud API | -- |

Switchable at runtime via CLI flag (`--profile`), Web UI toggle, or per-query.

### 5.3 Adaptive Retrieval

```
1st attempt: default k -> if results < 3
2nd attempt: k * 2.5 -> if results < 3
3rd attempt: relaxed query (fewer keywords) -> if results = 0
4th attempt: web search fallback (if enabled)
```

### 5.4 Confidence Scoring

```typescript
const confidenceFactors = {
  retrievalScore: 0.4,
  rerankScore: 0.3,
  sourceCount: 0.15,
  chunkCoverage: 0.15,
}
// Levels: high (>= 0.7) | medium (>= 0.4) | low (>= 0.2) | none (< 0.2)
```

Low confidence answers include: honest admission, related documents found, suggestions for improvement.

### 5.5 Caching Strategy

| Layer | Scope | TTL | Purpose |
|-------|-------|-----|---------|
| L1 | Query cache (in-memory) | 5m | Skip RAG for identical queries |
| L2 | Embedding cache (disk) | 24h | Avoid re-embedding same text |
| L3 | Web search cache (disk) | 1h | Avoid duplicate web searches |

### 5.6 Intent-Specific Prompt Templates

Each intent uses a dedicated system prompt optimized for output format:

- **code:** Prioritize code examples, use fenced code blocks with language tags, present most idiomatic approach first
- **concept:** Explain clearly with analogies, include code only when it clarifies, structure with headings
- **data:** Be precise with numbers, use tables, always state source document and date
- **search:** List relevant documents with summaries, sort by relevance, include path and last updated
- **compare:** Structured side-by-side comparison, use tables, cite both sources

All templates share common rules: cite sources using `[Source: filename#section]`, respond in the user's language, admit when context is insufficient, mention conflicting sources when found.

---

## 6. Interfaces

### 6.1 CLI Command Tree

```
opendocs
|-- init                          # interactive setup
|-- start [--port] [--mcp-only] [--no-web]
|         --mcp-only: stdio MCP server only (no HTTP/WS/Web)
|         --no-web: HTTP API + WS + MCP over SSE, but no Web UI static serving
|-- stop
|-- ask "<query>" [--profile] [--source] [--json]
|-- search "<keyword>" [--type] [--top]
|-- index <path> [--watch] [--reindex]
|-- document list|get|delete|restore|reindex
|-- connector add|list|sync|status|auth|remove
|-- plugin add|remove|list|search|update|create|test|dev|publish
|-- workspace create|list|switch|delete
|-- auth login|create-key|list-keys|revoke-key
|-- config <key> [value] | edit | reset
|-- doctor
|-- upgrade
|-- export [--workspace] [--output]
|-- import <file>
|-- completion install [--shell]
|-- help
```

### 6.2 CLI Features

- **Interactive ask mode:** `opendocs ask` without query enters REPL with slash commands
- **Pipe support:** stdin input (`cat file | opendocs ask --stdin`), JSON output (`--json`), stdin-list for batch indexing
- **Shell completions:** zsh, bash, fish, powershell

### 6.3 Web UI Pages

```
/                       Chat (main)
/documents              Document management
/documents/:id          Document detail (chunk viewer)
/connectors             Connector management
/connectors/new         Add connector wizard (auto-generated from Config Schema)
/connectors/:id         Connector detail/settings
/plugins                Plugin management + marketplace browser
/admin                  Admin dashboard (stats, quality metrics, audit, plugin metrics)
/workspaces             Workspace management
/settings               Settings (model, RAG profile, security, theme, config editor)
/login                  Login (team mode)
```

### 6.4 Web UI Features

- Command palette (Cmd+K)
- Keyboard shortcuts (Cmd+/, Cmd+1-5, Cmd+Enter, Cmd+Shift+N, etc.)
- RAG profile toggle in chat (fast/balanced/precise)
- Source filter side panel (by connector, tag, collection)
- Answer feedback (thumbs up/down)
- Conversation sharing (workspace internal, link sharing, markdown/Notion export)
- i18n (ko, en; community contributions for ja, zh)
- Dark/light theme

### 6.5 MCP Server

Full API mirror -- every REST endpoint available as an MCP tool:

```
opendocs_ask, opendocs_search
opendocs_document_list|get|upload|delete|reindex
opendocs_index_path|status
opendocs_connector_add|list|sync|status|remove
opendocs_plugin_list|add|remove
opendocs_workspace_list|switch
opendocs_stats, opendocs_doctor, opendocs_config_get|set
```

MCP Resources: `opendocs://documents`, `opendocs://documents/{id}`, `opendocs://stats`

Connection modes: stdio (Claude Code, Cursor), SSE (remote).

### 6.6 Embeddable Chat Widget

```html
<script src="http://host:3000/widget.js"></script>
<script>
  OpenDocs.widget({
    server: 'http://host:3000',
    apiKey: 'od_live_...',       // required in team mode; omit in personal mode
    position: 'bottom-right',
    workspace: 'public-docs',
    theme: 'auto',
  })
</script>
```

### 6.7 API Client SDK

```typescript
import { OpenDocsClient } from '@opendocs/client'
const client = new OpenDocsClient({ baseUrl, apiKey })
```

Auto-generated from OpenAPI spec. TypeScript first-class.

### 6.8 CLI Color System

```typescript
const theme = {
  heading:    chalk.bold.white,
  divider:    chalk.dim,
  ok:         chalk.green('[ok]'),
  fail:       chalk.red('[!!]'),
  info:       chalk.blue('[--]'),
  arrow:      chalk.cyan('[->]'),
  wait:       chalk.yellow('[..]'),
  ask:        chalk.magenta('[??]'),
  skip:       chalk.dim('[skip]'),
  label:      chalk.dim,
  value:      chalk.white,
  highlight:  chalk.cyan,
  warn:       chalk.yellow,
  error:      chalk.red,
  success:    chalk.green,
  muted:      chalk.dim,
  selected:   chalk.cyan.bold,
  unselected: chalk.dim,
  recommend:  chalk.cyan('*'),
  badge:      chalk.bgCyan.black,
}
```

No emojis in CLI output. ANSI colors + ASCII symbols only.

---

## 7. Data Model

### 7.1 SQLite/PostgreSQL Schema

```sql
-- Workspaces
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    mode TEXT DEFAULT 'personal',
    settings JSONB DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workspace members (team mode)
CREATE TABLE workspace_members (
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT DEFAULT 'member',
    api_key TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_id)
);

-- Connectors
CREATE TABLE connectors (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config JSONB NOT NULL,
    sync_interval_seconds INTEGER DEFAULT 300,
    last_synced_at DATETIME,
    status TEXT DEFAULT 'active',
    error_message TEXT,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents
CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    connector_id TEXT REFERENCES connectors(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_path TEXT NOT NULL,
    file_type TEXT,
    file_size_bytes INTEGER,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    content_hash TEXT,
    parser_used TEXT,
    parse_duration_ms INTEGER,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    indexed_at DATETIME
);

-- Document versions
CREATE TABLE document_versions (
    id TEXT PRIMARY KEY,
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    chunk_count INTEGER,
    changes JSONB,
    snapshot_chunk_ids JSONB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tags
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    UNIQUE(workspace_id, name)
);

CREATE TABLE document_tags (
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

-- Collections
CREATE TABLE collections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    auto_rules JSONB,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collection_documents (
    collection_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
    document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
    PRIMARY KEY (collection_id, document_id)
);

-- Chunk relationships
CREATE TABLE chunk_relations (
    source_chunk_id TEXT NOT NULL,
    target_chunk_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    PRIMARY KEY (source_chunk_id, target_chunk_id, relation_type)
);

-- Conversations
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id TEXT,
    title TEXT,
    shared BOOLEAN DEFAULT FALSE,
    share_token TEXT UNIQUE,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    sources JSONB,
    profile_used TEXT,
    confidence_score REAL,
    response_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Query logs
CREATE TABLE query_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    intent TEXT,
    profile TEXT,
    retrieved_chunk_ids JSONB,
    reranked_chunk_ids JSONB,
    retrieval_score_avg REAL,
    rerank_score_avg REAL,
    confidence_score REAL,
    response_time_ms INTEGER,
    web_search_used BOOLEAN DEFAULT FALSE,
    feedback TEXT,
    route TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    user_id TEXT,
    event_type TEXT NOT NULL,
    details JSONB,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Plugins
CREATE TABLE plugins (
    name TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    version TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    permissions JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active',
    installed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_documents_workspace ON documents(workspace_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_source_type ON documents(source_type);
CREATE INDEX idx_documents_content_hash ON documents(content_hash);
CREATE INDEX idx_documents_deleted ON documents(deleted_at);
CREATE INDEX idx_connectors_workspace ON connectors(workspace_id);
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_query_logs_workspace ON query_logs(workspace_id, created_at);
CREATE INDEX idx_audit_logs_event ON audit_logs(event_type, created_at);
CREATE INDEX idx_doc_versions ON document_versions(document_id, version);
```

### 7.2 Vector DB Collection

```typescript
interface VectorCollection {
  name: 'opendocs_chunks'
  vectors: {
    dense: { dimensions: 'auto', distance: 'cosine' },  // determined by selected embedding model (BGE-M3: 1024, nomic: 768, etc.)
    sparse: { type: 'sparse' },
    multimodal?: { dimensions: 1024, distance: 'cosine' },  // separate named vector, coexists with dense; used only for image-type chunks
  }
  payload: {
    workspace_id: 'keyword',
    document_id: 'keyword',
    source_type: 'keyword',
    chunk_type: 'keyword',
    language: 'keyword',
    heading_hierarchy: 'keyword[]',
    code_symbols: 'keyword[]',
    position: 'integer',
    page: 'integer',
    token_count: 'integer',
    content_hash: 'keyword',
    created_at: 'datetime',
  }
}
```

### 7.3 Soft Delete

All major tables have `deleted_at` column. Deleted items move to trash, permanently removed after 30 days by an internal scheduler (node-cron, runs within the server process). `opendocs document restore` available for recovery.

### 7.4 Schema Migration

Uses a custom lightweight migration runner (no external ORM dependency). Migration files are numbered SQL scripts:

```
migrations/
  001_initial.sql
  002_add_tags.sql
  003_add_document_versions.sql
  ...
```

A `schema_migrations` table tracks applied migrations. `opendocs upgrade` runs pending migrations automatically. Migrations are embedded in `@opendocs/core` and versioned with the package.

### 7.5 Config Source of Truth

`opendocs.config.ts` is the **primary** source of truth for static configuration (model, RAG profile, security, plugins). The database stores **runtime state** (connector sync status, documents, conversations, user data). When a connector is added via Web UI, both the database record and `opendocs.config.ts` are updated. On startup, config file takes precedence; database state is reconciled.

---

## 8. Security & Authentication

### 8.1 Auth Modes

- **Personal mode (default):** No auth. Single auto-created workspace ('default'). Additional workspaces can be created but no role-based access control. localhost access only.
- **Team mode:** Session-based (Web UI), API Key (API/CLI/MCP/Widget). Full RBAC and workspace isolation.

### 8.2 Roles

| Role | Permissions |
|------|------------|
| admin | All + settings + member management |
| member | Query + upload + use connectors |
| viewer | Query only (read-only) |

### 8.3 API Key Features

- Scoped permissions (`ask`, `search`, `document:read`, `document:write`, `connector:read`, `connector:write`, `admin`, `*`)
- Per-key rate limiting
- Expiration date
- IP restrictions
- Rotation reminder (configurable, default 90 days)

Rate limit state is stored in-memory (default) or SQLite for persistence across restarts. When both API-key-level and global rate limits are configured, the stricter limit applies. Default global limits: 60 queries/min, 100 index operations/hour, 1000 API calls/hour.

### 8.4 Workspace Isolation

- Every vector search enforced with `workspace_id` filter
- Separate connector/document/conversation data per workspace
- Per-workspace security policy overrides
- Admin cross-workspace search (with permission check)

### 8.5 SSO / OAuth (Phase 2)

Providers: local, Google, GitHub, SAML, OIDC.
Auto-assign: map identity provider groups to workspaces + roles.

### 8.6 Access Control

- IP whitelist
- CORS allowed origins
- Widget allowed domains
- Rate limiting (query, index, api -- configurable per tier)

### 8.7 Security Alerts

```typescript
rules: [
  { name: 'brute-force', condition: 'auth:failed > 10 in 5m', action: 'block-ip' },
  { name: 'unusual-export', condition: 'document:exported > 50 in 1h', action: 'notify' },
  { name: 'api-key-abuse', condition: 'api:rate-exceeded > 5 in 10m', action: 'throttle' },
  { name: 'off-hours-access', condition: 'auth:login AND time NOT IN 09:00-22:00', action: 'notify' },
]
```

### 8.8 Personal to Team Migration

`opendocs config mode team` -- interactive flow to set admin account, network access, API keys. Existing data preserved.

---

## 9. Model Selection System

### 9.1 LLM Models (Local / Ollama)

| Model | Params | Multimodal | VRAM | Korean | Recommendation |
|-------|--------|-----------|------|--------|---------------|
| Qwen 2.5 | 7B/14B/32B/72B | Vision | 6-48GB | Excellent | Recommended |
| Llama 3.3 | 8B/70B | Vision | 6-40GB | Good | Recommended |
| DeepSeek-V3 | 7B/67B | Text only | 6-40GB | Excellent | Conditional |
| Gemma 3 | 4B/12B/27B | Vision | 4-20GB | Good | Lightweight |
| Phi-4 | 14B | Vision | 10GB | Good | Mid-range |
| EXAONE | 7.8B/32B | Text only | 6-24GB | Best | Korean specialized |
| Solar | 10.7B | Text only | 8GB | Best | Korean specialized |

### 9.2 Embedding Models

| Model | Dims | Korean | Multimodal | Note |
|-------|------|--------|-----------|------|
| BGE-M3 | 1024 | Excellent | No | Default recommended |
| multilingual-e5-large | 1024 | Excellent | No | Alternative |
| nomic-embed-text | 768 | Good | No | Lightweight |
| Jina-CLIP-v2 | 1024 | Excellent | Image+Text | Multimodal recommended |

### 9.3 Cloud Providers

| Provider | LLM | Embedding | Vision |
|----------|-----|-----------|--------|
| OpenAI | GPT-4o/4.1 | text-embedding-3 | GPT-4o |
| Anthropic | Claude Sonnet/Opus | -- (use OpenAI or local for embedding) | Claude Vision |
| Google | Gemini 2.5 | text-embedding-004 | Gemini Vision |

### 9.4 Auto-Recommendation

`opendocs init` detects CPU, RAM, GPU/VRAM, disk and recommends optimal model + RAG profile. Performance warnings shown for resource-intensive options.

---

## 10. Supported File Formats

### MVP (Phase 1)

| Format | Plugin | Notes |
|--------|--------|-------|
| .md / .mdx | built-in (core) | code fence aware; only built-in parsers |
| .txt | built-in (core) | plain text; only built-in parsers |
| .pdf | @opendocs/parser-pdf | fallback: OCR for scanned PDFs |
| .docx | @opendocs/parser-docx | mammoth-based |
| .js/.ts/.py/.go/etc | @opendocs/parser-code | tree-sitter AST, function/class level chunking |
| .json / .yaml / .toml | built-in (core) | config/schema, simple parse |
| .zip | built-in (core) | extract + recurse, re-enter each file to parser |

### Phase 2

| Format | Plugin | Notes |
|--------|--------|-------|
| .hwp / .hwpx | @opendocs/parser-hwp | LibreOffice CLI; fallback: OCR |
| .pptx | @opendocs/parser-pptx | 1 slide = 1 chunk |
| .xlsx / .csv | @opendocs/parser-xlsx | xlsx + csv-parse |
| .html | @opendocs/parser-html | cheerio-based |
| .ipynb | @opendocs/parser-jupyter | code + markdown cells |
| .mp4/.mov/.avi | Whisper STT plugin | |
| .mp3/.wav/.m4a | Whisper STT plugin | |
| .jpg/.png/.webp | @opendocs/parser-ocr | OCR + Vision LLM |
| .eml/.msg | mailparser plugin | |
| .rst | text parse plugin | |
| .proto/.graphql | text parse plugin | |
| .7z/.rar | 7zip CLI extract | |

### Phase 3+

| Format | Method |
|--------|--------|
| .fig (Figma) | Figma API |
| .sqlite/.db | better-sqlite3 |
| .parquet | parquet-wasm |
| .dwg/.dxf (CAD) | LibreCAD/ODA metadata |
| .epub | epub parse |
| .svg | XML text extraction |
| .ics | ical parse |

---

## 11. Data Sources (Connectors)

### MVP

- Local directory (chokidar file watch)
- File upload (drag & drop, CLI)

### Phase 2

- GitHub (README, Wiki, Issues, Discussions -- Webhook + polling)
- Notion (pages, databases -- polling)
- MCP client (connect external MCP servers -- MCP-first strategy)
- Web crawler (user-registered URLs -- periodic crawl, cookie/header auth for intranets)
- Real-time web search (Tavily/SearXNG -- merged into RAG results)
- Swagger/OpenAPI
- Google Drive
- S3/GCS/Azure Blob
- Network drives (SMB/NFS)

### Phase 3+

- Confluence
- OneDrive/SharePoint
- Dropbox
- Slack/Discord
- Jira/Linear
- Postman Collection
- RSS/Atom
- GraphQL Introspection

### Connector Strategy

MCP client first: if an MCP server exists for a service, connect via MCP. Self-implement only for services without MCP servers.

---

## 12. Configuration

### 12.1 Config as Code

```typescript
// opendocs.config.ts
import { defineConfig } from '@opendocs/core'

export default defineConfig({
  workspace: 'my-team',
  mode: 'personal',

  model: {
    provider: 'ollama',
    llm: 'qwen2.5:14b',
    embedding: 'bge-m3',
  },

  rag: {
    profile: 'balanced',
  },

  connectors: [
    { type: 'local', path: './docs', watch: true },
    { type: 'github', repo: 'org/docs', watch: true },
  ],

  plugins: [
    '@opendocs/parser-pdf',
    '@opendocs/parser-hwp',
  ],

  parserFallbacks: {
    '.hwp': ['@opendocs/parser-hwp', '@opendocs/parser-libreoffice', '@opendocs/parser-ocr'],
  },

  middleware: {
    'before:chunk': './hooks/expand-terms.ts',
  },

  security: {
    dataPolicy: { allowCloudProcessing: true, autoRedact: { enabled: true } },
    audit: { enabled: true },
  },

  ui: { locale: 'auto', theme: 'auto' },

  telemetry: { enabled: true },
})
```

### 12.2 opendocs doctor

Full system diagnosis: core, server, DB, vector DB, model, plugins (with per-plugin metrics), security settings, disk space, recent activity summary.

### 12.3 Opt-in Telemetry

Anonymous usage stats (OS, Node version, plugins used, error counts). No personal data or document content. Prompted during `opendocs init`.

---

## 13. Project Structure (Monorepo)

```
opendocs/
|-- package.json              (turborepo root)
|-- turbo.json
|-- packages/
|   |-- core/                 @opendocs/core
|   |-- server/               @opendocs/server
|   |-- cli/                  @opendocs/cli
|   |-- web/                  @opendocs/web
|   |-- client/               @opendocs/client (SDK)
|-- plugins/
|   |-- connector-github/     @opendocs/plugin-github
|   |-- connector-notion/     @opendocs/plugin-notion
|   |-- connector-gdrive/     @opendocs/plugin-gdrive
|   |-- connector-confluence/ @opendocs/plugin-confluence
|   |-- connector-web-crawler/@opendocs/plugin-web-crawler
|   |-- connector-mcp/        @opendocs/plugin-mcp
|   |-- connector-s3/         @opendocs/plugin-s3
|   |-- parser-pdf/           @opendocs/parser-pdf
|   |-- parser-docx/          @opendocs/parser-docx
|   |-- parser-hwp/           @opendocs/parser-hwp
|   |-- parser-pptx/          @opendocs/parser-pptx
|   |-- parser-xlsx/          @opendocs/parser-xlsx
|   |-- parser-html/          @opendocs/parser-html
|   |-- parser-code/          @opendocs/parser-code
|   |-- parser-jupyter/       @opendocs/parser-jupyter
|   |-- parser-ocr/           @opendocs/parser-ocr
|   |-- parser-libreoffice/   @opendocs/parser-libreoffice
|   |-- model-ollama/         @opendocs/model-ollama
|   |-- model-openai/         @opendocs/model-openai
|   |-- model-anthropic/      @opendocs/model-anthropic
|   |-- model-google/         @opendocs/model-google
|-- templates/                plugin scaffolding templates
|-- benchmarks/               RAG quality benchmarks
|-- docs/                     documentation source
|-- docs-site/                VitePress documentation site
|-- .github/                  CI/CD, issue templates, PR templates
```

---

## 14. Roadmap

### Phase 1: Foundation (Week 1-6)

**Goal:** `npm install -g @opendocs/cli && opendocs init && opendocs start` works end-to-end.

| Week | Milestone |
|------|-----------|
| W1 | Project bootstrap: Turborepo, package structure, CI, core skeleton, config schema, Changesets |
| W2 | Plugin system: Registry, interfaces, loader, Config Schema, Event Bus, capability negotiation |
| W3 | Ingest pipeline: orchestrator, semantic chunker, code AST chunker, fallback chain |
| W4 | RAG engine: Query Router, Hybrid Retriever, RRF, Reranker, Generator, profiles |
| W5 | Server + CLI: HTTP API, WebSocket streaming, MCP server, full CLI commands, shell completion |
| W6 | Web UI + integration: chat UI, document management, connector UI, interactive init, doctor |

**Done when:**
- Full init -> index -> ask -> answer flow works
- CLI, Web UI, MCP all functional
- fast/balanced/precise profiles
- Confidence score + hallucination guard
- Personal mode with multi-workspace schema ready
- `opendocs doctor` working
- Contributor setup: `npm run setup` one-command dev environment

**MVP plugins:** local-fs, file-upload, markdown, txt, pdf, docx, code, json/yaml, ollama, openai

### Phase 2: Connectors + Enterprise (Week 7-14)

| Week | Milestone |
|------|-----------|
| W7 | Parser expansion: HWP, PPTX, XLSX/CSV, HTML, Jupyter |
| W8 | GitHub + Notion connectors: real-time sync |
| W9 | MCP client + web connectors: external MCP, web crawler, Tavily web search |
| W10 | Team mode + auth: multi-workspace, API Key (scoped), session auth, roles |
| W11 | Security hardening: PII redaction, audit log, cloud restrictions, rate limiting |
| W12 | Plugin Dev Kit: create/test/dev/publish, marketplace CLI |
| W13 | RAG improvements: Multi-Query Decomposition, Adaptive Retrieval, Cross-Lingual |
| W14 | Admin dashboard: indexing stats, quality metrics, audit viewer, plugin metrics |

**Done when:** 5+ connectors, team mode, security, Plugin Dev Kit, admin dashboard

### Phase 3: Ecosystem + Scale (Week 15-20+)

| Week | Milestone |
|------|-----------|
| W15 | More connectors: Google Drive, Confluence, S3/GCS, email |
| W16 | Multimodal: Whisper STT, Vision LLM, Jina-CLIP multimodal embedding |
| W17 | SSO + advanced security: OAuth, SAML, Security Alerts, cross-workspace search |
| W18 | Advanced features: Document Versioning, Tags + Collections, Chunk Relationships, conversation sharing |
| W19 | Embeddable Widget + SDK: widget.js, @opendocs/client, i18n (ko/en) |
| W20 | Release: Hot Reload, Import/Export, production Docker Compose, docs site, demo video |

### Phase 4+: Community-Driven

Design file parsers (Figma), DB parsers (SQLite, Parquet), CAD parsers, Slack/Discord/Jira/Linear connectors, Postman/RSS/GraphQL, Plugin Migration system, telemetry dashboard, online demo, marketplace website, RAG quality benchmarks in CI.

---

## 15. Success Metrics

| Metric | Target | Method |
|--------|--------|--------|
| Retrieval Hit Rate | >= 85% | Top-5 contains relevant doc |
| Answer Relevance | >= 4.0/5.0 | User feedback |
| Indexing Throughput | >= 100 docs/min | Batch indexing speed |
| Query Latency (P95) | <= 5s | Query to first token (local LLM) |
| GitHub Stars | >= 100 (6 months) | Open-source traction |
| npm Weekly Downloads | >= 500 (6 months) | Package adoption |
| Community Plugins | >= 10 (1 year) | Ecosystem health |

---

## 16. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Node.js RAG ecosystem maturity | Some parsers less mature than Python | Fallback chains, LibreOffice CLI, community plugins |
| HWP parsing instability | Korean doc indexing failures | 3-level fallback: native -> LibreOffice -> OCR |
| Local GPU memory constraints | Can't run LLM + Embedding simultaneously | Quantization + CPU fallback for embedding |
| Plugin compatibility breaks | Community plugins break on core update | Capability negotiation, semver enforcement, CI compatibility matrix |
| Security with cloud processing | Data leak of sensitive documents | PII redaction, source restrictions, audit logging, workspace-level policies |
| Monorepo complexity | Slow CI, complex releases | Turborepo caching, Changesets auto-release, affected-only testing |
