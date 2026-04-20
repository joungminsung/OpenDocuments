<p align="center">
  <h1 align="center">OpenDocuments</h1>
  <p align="center"><strong>Open source RAG tool for AI document search — connect GitHub, Notion, Google Drive and ask questions with cited answers</strong></p>
</p>

<p align="center">
  <a href="https://github.com/joungminsung/OpenDocuments/actions"><img src="https://github.com/joungminsung/OpenDocuments/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-20%2B-green.svg" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.5%2B-blue.svg" alt="TypeScript"></a>
  <a href="https://www.npmjs.com/package/opendocuments"><img src="https://img.shields.io/npm/v/opendocuments.svg" alt="npm"></a>
  <a href="https://www.npmjs.com/package/opendocuments"><img src="https://img.shields.io/npm/dm/opendocuments.svg" alt="npm downloads"></a>
  <a href="https://github.com/joungminsung/OpenDocuments/stargazers"><img src="https://img.shields.io/github/stars/joungminsung/OpenDocuments.svg?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" alt="OpenDocuments Demo" width="800">
</p>

---

## The Problem: Scattered Knowledge, No AI Search

Your team's knowledge is trapped in silos:

- **Engineering docs** live in GitHub READMEs and Wiki pages
- **Product specs** are scattered across Notion databases
- **Budget reports** sit in Excel files on Google Drive
- **API docs** are auto-generated Swagger specs nobody reads
- **Meeting notes** rot in Confluence spaces
- **Onboarding guides** are buried in `.docx` files on S3

When someone asks _"How does our auth system work?"_ or _"What was the Q3 budget for the AI team?"_, they spend 15 minutes hunting through 5 different tools. And they still might not find the answer.

## The Solution: Self-Hosted AI Document Search

OpenDocuments **connects to all your document sources**, **indexes everything into a unified search engine**, and **answers questions in natural language** -- with source citations so you know exactly where the answer came from.

```bash
npm install -g opendocuments
opendocuments init
opendocuments start
```

Open `http://localhost:3000`, and ask away.

> **OpenDocuments** is a free, open source alternative to proprietary enterprise AI search tools. It's a self-hosted RAG (Retrieval-Augmented Generation) platform that runs on your own infrastructure.

### Recent Improvements
- **One-touch Ollama setup**: `init` auto-detects Ollama, offers to pull missing models
- **`.env` auto-loading**: API keys in `.env` are loaded automatically (no manual export needed)
- **Multi-turn conversations**: Chat remembers previous context for follow-up questions
- **Degraded mode warnings**: Clear banners when models aren't configured, with fix instructions
- **Enhanced diagnostics**: `opendocuments doctor` checks Ollama connectivity, model availability, and config validity
- **Security hardening**: FTS5 injection prevention, file upload sanitization, OAuth state limits, workspace isolation

---

## Real-World Use Cases

### For Engineering Teams

> _"How do I authenticate against our internal API?"_

OpenDocuments pulls the answer from your GitHub repo's `docs/auth.md`, links to the relevant Swagger endpoint, and includes a code example from the codebase -- all in one response.

```bash
# Index your repo and API docs
opendocuments index ./docs
opendocuments connector sync github
opendocuments ask "How does JWT token refresh work in our API?"
```

### For Operations & HR Teams

> _"What's the remote work policy for the Tokyo office?"_

OpenDocuments searches across your Confluence HR space, the employee handbook on Google Drive, and the latest policy update email -- even if some documents are in Korean and others in English.

```bash
opendocuments ask "도쿄 오피스 원격 근무 정책이 뭐야?" --profile precise
# Cross-lingual search finds both Korean and English documents
```

### For Product Managers

> _"Compare the feature specs of v2.0 vs v3.0"_

OpenDocuments decomposes the question, searches both versions' specs, and presents a structured comparison table -- citing each source document.

### For AI-Assisted Development (MCP)

Use OpenDocuments as a knowledge base for **Claude Code**, **Cursor**, or any MCP-compatible AI tool:

```json
{
  "mcpServers": {
    "opendocuments": {
      "command": "opendocuments",
      "args": ["start", "--mcp-only"]
    }
  }
}
```

Now your AI coding assistant can search your organization's entire document corpus while writing code.

### For Self-Hosted Knowledge Bases

Deploy on your own infrastructure. Your data **never leaves your network** when using a local LLM via Ollama. No cloud dependency, no vendor lock-in, no subscription fees.

```bash
docker compose --profile with-ollama up -d
# Everything runs locally: LLM, embeddings, vector search, web UI
```

---

## Quick Start

### 1. Install

```bash
npm install -g opendocuments
```

### 2. Initialize

```bash
opendocuments init
```

The interactive wizard will:
- Detect your hardware (CPU, RAM) and recommend the optimal LLM
- Let you choose between **local** (Ollama) or **cloud** (OpenAI, Claude, Gemini, Grok) models
- **Auto-detect Ollama** and offer to pull missing models automatically
- **Validate cloud API keys** before saving
- Select a plugin preset: `Developer`, `Enterprise`, `All`, or `Custom`
- Generate `opendocuments.config.ts` and `.env` (API keys loaded automatically)

### 3. Start

```bash
opendocuments start
```

Open **http://localhost:3000** -- you'll see a chat UI, document manager, and admin dashboard.

> **First time?** If Ollama isn't running, you'll see a clear **DEGRADED MODE** banner with step-by-step fix instructions. Run `opendocuments doctor` for full diagnostics.

### 4. Index Your Documents

```bash
# Index a local directory (recursively finds all supported files)
opendocuments index ./docs

# Watch mode: auto-reindex when files change
opendocuments index ./docs --watch

# Or drag-and-drop files in the Web UI
```

### 5. Ask Questions

```bash
opendocuments ask "What's our deployment process?"
```

---

## How It Works

```
    Your Documents                    OpenDocuments                     You
    ─────────────                    ──────────────                    ───

    GitHub repos ──┐
    Notion pages ──┤                ┌─────────────┐
    Google Drive ──┤  ── Ingest ──► │ Parse        │
    Confluence   ──┤                │ Chunk        │     "How does
    S3 buckets   ──┤                │ Embed        │      auth work?"
    Swagger specs──┤                │ Store        │          │
    Local files  ──┤                └──────┬───────┘          │
    Web pages    ──┘                       │                  ▼
                                    ┌──────┴───────┐  ┌─────────────┐
                                    │  SQLite      │  │ RAG Engine  │
                                    │  (metadata)  │◄─┤ Search      │
                                    │              │  │ Rerank      │
                                    │  LanceDB     │  │ Generate    │
                                    │  (vectors)   │  │ Cite sources│
                                    └──────────────┘  └──────┬──────┘
                                                             │
                                                             ▼
                                                      "Auth uses JWT
                                                       tokens with
                                                       refresh flow.
                                                       [Source: auth.md]"
```

### The RAG Pipeline

1. **Intent Classification** -- Understands whether you're asking about code, concepts, data, or want a comparison
2. **Query Decomposition** -- Breaks complex questions into sub-queries for better retrieval
3. **Cross-Lingual Search** -- Finds documents in both Korean and English regardless of query language
4. **Hybrid Search** -- Combines dense vector search (semantic) with FTS5 sparse search (keyword) via Reciprocal Rank Fusion
5. **Reranking** -- Scores results by keyword overlap and model-based relevance
6. **Confidence Scoring** -- Tells you honestly when it's not sure about an answer
7. **Hallucination Guard** -- Verifies each sentence is grounded in the retrieved sources
8. **3-Tier Caching** -- L1 query cache (5min), L2 embedding cache (24h), L3 web search cache (1h)

---

## Supported File Formats

| Format | Extensions | How It's Parsed |
|--------|-----------|-----------------|
| Markdown | `.md`, `.mdx` | Heading hierarchy, code block separation |
| Plain Text | `.txt` | Direct text indexing |
| PDF | `.pdf` | Page-level extraction, OCR fallback for scanned docs |
| Word | `.docx` | HTML conversion with heading detection |
| Excel / CSV | `.xlsx`, `.xls`, `.csv` | Sheet-aware table chunking (header + rows) |
| HTML | `.html`, `.htm` | Structure-preserving extraction, script/nav stripping |
| Jupyter Notebook | `.ipynb` | Markdown cells + code cells with language detection |
| Email | `.eml` | Header parsing (from/to/subject/date) + body extraction |
| Source Code | `.js`, `.ts`, `.py`, `.java`, `.go`, `.rs`, `.rb`, `.php`, `.swift`, `.kt` + more | Function/class-level chunking with import extraction |
| PowerPoint | `.pptx` | Slide-level text extraction |
| Structured Data | `.json`, `.yaml`, `.yml`, `.toml` | Config and schema indexing |
| Archive | `.zip` | Placeholder (full extraction planned) |

**Fallback Chains**: If a parser fails, the next one tries automatically:

```typescript
parserFallbacks: {
  '.pdf': ['@opendocuments/parser-pdf', '@opendocuments/parser-ocr'],
}
```

---

## Data Sources

| Source | What It Indexes | Auth | How It Syncs |
|--------|----------------|------|-------------|
| **Local Files** | Any supported format on your filesystem | None | File watching (`--watch`) |
| **File Upload** | Drag-and-drop in Web UI | None | Instant |
| **GitHub** | README, Wiki, code files, Issues | Personal Access Token | Polling / webhook |
| **Notion** | Pages, databases, all block types | Integration Token | Polling |
| **Google Drive** | Docs, Sheets, Slides, uploaded files | OAuth / Service Account | Polling |
| **Amazon S3 / Google Cloud Storage** | Any supported format in buckets | AWS / GCP credentials | Polling |
| **Confluence** | Wiki pages across spaces | API Token + Email | Polling |
| **Swagger / OpenAPI** | API endpoints with parameters and schemas | None (public specs) | Manual |
| **Web Crawler** | Any URL you register | Optional (cookies/headers) | Periodic |
| **Web Search (Tavily)** | Real-time web results merged into answers | Tavily API Key | Query-time |

---

## Model Providers

### Cloud Providers

| Provider | Models | Embedding | Best For |
|----------|--------|-----------|----------|
| **OpenAI** | GPT-5.4, GPT-5.4-mini, GPT-4.1, o3, o4-mini | text-embedding-3-small/large | General purpose, vision, reasoning |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5 | -- (use separate provider) | Long context (1M), coding, analysis |
| **Google** | Gemini 3.1 Pro, Gemini 3.1 Flash Lite, Gemini 3.0 Deep Think | text-embedding-005 | Multimodal, multilingual |
| **xAI** | Grok 4, Grok 4 Heavy, Grok 4.1 Fast | Grok embedding | Real-time knowledge, code |
| **DeepSeek** | DeepSeek-V3.2, DeepSeek-R1, DeepSeek-V4 (upcoming) | -- (use separate provider) | Cost-efficient reasoning, 164K context |
| **Mistral** | Mistral Small 4 (MoE), Large 2.1, Codestral, Pixtral | mistral-embed (1024) | European data residency, coding, vision |
| **OpenAI-compatible** | Any OpenAI-compatible endpoint | Depends on endpoint | vLLM, LM Studio, Together, Fireworks, Groq, DeepInfra, SiliconFlow, OpenRouter |

### Local Models (via Ollama)

| Model | Active Params | Total Params | Vision | Korean | Best For |
|-------|-------------|-------------|--------|--------|----------|
| **Qwen 3.5 27B** | 27B (dense) | 27B | Yes | Excellent | General purpose (32GB+ RAM) |
| **Qwen 3.5 9B** | 9B (dense) | 9B | Yes | Excellent | Mid-range (16GB RAM) |
| **Qwen 3.5-122B-A10B** | 10B (MoE) | 122B | Yes | Excellent | High quality, efficient |
| **Llama 4 Scout** | 17B (MoE) | 109B | Yes | Good | 10M context window |
| **Llama 4 Maverick** | 17B (MoE) | 400B | Yes | Good | Top open-source quality |
| **DeepSeek V3.2** | 37B (MoE) | 671B | No | Good | Coding, reasoning |
| **Gemma 4** | 27B / 12B / 4B / 1B | dense | Yes | Good | Latest Google open model, 128K context, 140+ languages |
| **Gemma 3 27B** | 27B | 27B | Yes | Good | Lightweight, 140+ languages |
| **Gemma 3 4B** | 4B | 4B | Yes | Good | Low-spec machines (8GB RAM) |
| **K-EXAONE** | 23B (MoE) | 236B | No | Best | Korean-specialized |
| **EXAONE Deep 32B** | 32B | 32B | No | Best | Korean reasoning |
| **Phi-4 Reasoning Vision** | 15B | 15B | Yes | Fair | Compact multimodal |

### Embedding Models

| Model | Dimensions | Korean | Multimodal | Where |
|-------|-----------|--------|-----------|-------|
| **BGE-M3** | 1024 | Excellent | No | Ollama (default) |
| **text-embedding-3-large** | 3072 | Good | No | OpenAI |
| **text-embedding-005** | 768 | Good | No | Google |
| **nomic-embed-text** | 768 | Fair | No | Ollama (lightweight) |

### Auto-Recommendation

`opendocuments init` detects your hardware and recommends the best model:

| Your Hardware | Recommended Model | Recommended Embedding |
|--------------|-------------------|----------------------|
| 32GB+ RAM, GPU | Qwen 3.5 27B or Llama 4 Scout | BGE-M3 |
| 16GB RAM | Qwen 3.5 9B | BGE-M3 |
| 8GB RAM | Gemma 3 4B | nomic-embed-text |
| Any (cloud) | Claude Sonnet 4.6 or GPT-5.4-mini | text-embedding-3-large |

---

## Three Ways to Use

### 1. Web UI

Full-featured dashboard at `http://localhost:3000`:

| Page | What You Can Do |
|------|-----------------|
| **Chat** | Ask questions with streaming answers, source citations, confidence scores, feedback buttons. Switch between fast/balanced/precise profiles. |
| **Documents** | Browse indexed documents, drag-and-drop upload, view document details, soft-delete with trash/restore. |
| **Connectors** | See connector sync status and last sync times. |
| **Plugins** | View installed plugins with health indicators. |
| **Settings** | Toggle dark/light theme, change RAG profile, view server version. |
| **Admin** | Stats dashboard, search quality metrics, paginated query logs, plugin health, connector status, audit logs. |

**Keyboard shortcuts**: `Cmd+K` opens the Command Palette. `Cmd+1-5` navigates between pages.

### 2. CLI

17 commands for power users and automation:

```bash
# Ask questions
opendocuments ask "What's the deploy process?"
opendocuments ask                              # Interactive REPL mode
opendocuments search "auth middleware" --top 10 # Vector search, no LLM

# Manage documents
opendocuments index ./docs --watch    # Index + auto-reindex on changes
opendocuments document list           # See all indexed docs
opendocuments document delete <id>    # Soft-delete

# Manage connectors
opendocuments connector sync          # Sync all connectors
opendocuments connector status        # Check sync status

# Pipe support for scripting
cat README.md | opendocuments ask "Summarize this" --stdin
opendocuments ask "List endpoints" --json | jq '.sources[].sourcePath'

# Administration
opendocuments doctor                  # Health check (per-provider API ping)
opendocuments auth create-key --name "ci-bot" --role member
opendocuments export --output ./backup

# Model management
opendocuments model list --suggestions          # Show installed + curated models
opendocuments model install-ollama              # One-shot Ollama install (macOS/Linux)
opendocuments model pull gemma3:27b bge-m3      # Batch pull with disk-space check
opendocuments model set-key deepseek            # Prompt + save API key to .env
opendocuments model test                        # Round-trip test against configured LLM
opendocuments model switch                      # Change provider without editing config
```

### 3. MCP Server

19 tools for AI-assisted workflows. Works with Claude Code, Cursor, Windsurf, and any MCP client.

```bash
opendocuments start --mcp-only
```

Your AI assistant can then:
- Search your organization's documents while coding
- Index new files as they're created
- Check document status and connector health
- Query configuration

---

## RAG Profiles

| | `fast` | `balanced` | `precise` |
|--|--------|------------|-----------|
| **Speed** | ~1s | ~3s | ~5s+ |
| **Search depth** | 10 docs | 20 docs | 50 docs |
| **Reranking** | Off | On | On |
| **Cross-lingual** | Off | Korean + English | Korean + English |
| **Query decomposition** | Off | Off | Splits complex queries |
| **Web search** | Off | Fallback when local results are weak | Always merged |
| **Hallucination guard** | Off | Checks source grounding | Strict mode (annotates unverified) |
| **Best for** | Quick lookups, 8B local models | Daily use, 14B+ models | Critical questions, cloud LLMs |

Switch anytime: CLI flag (`--profile precise`), Web UI toggle, or config file.

---

## Security

### Personal Mode (default)

Zero configuration. No auth. Localhost only. Just works.

### Team Mode

```typescript
// opendocuments.config.ts
export default defineConfig({ mode: 'team' })
```

| Feature | How It Works |
|---------|-------------|
| **API Keys** | `od_live_` prefix, SHA-256 hashed, never stored in plaintext. Scoped to specific operations, with optional expiration. |
| **Roles** | `admin` (everything), `member` (read + write), `viewer` (read only) |
| **Rate Limiting** | 60 req/min default, per-key override. In-memory with lazy cleanup. |
| **PII Redaction** | Automatically masks emails, phone numbers, credit cards, IPs before sending to cloud LLMs. Configurable patterns and methods (replace/hash/remove). |
| **Audit Log** | Records auth events, document access, config changes. Queryable via admin API. |
| **Security Alerts** | Detects brute-force attempts, unusual data exports, API key abuse. |
| **OAuth SSO** | Google and GitHub login with HttpOnly cookie sessions. |
| **Workspace Isolation** | Every vector search is enforced with `workspace_id` filter. Documents, conversations, and API keys are scoped to workspaces. |

---

## Configuration

```typescript
// opendocuments.config.ts
import { defineConfig } from 'opendocuments-core'

export default defineConfig({
  workspace: 'my-team',
  mode: 'personal',

  model: {
    provider: 'ollama',
    llm: 'qwen3.5:27b',
    embedding: 'bge-m3',
  },

  rag: { profile: 'balanced' },

  connectors: [
    { type: 'github', repo: 'org/repo', token: process.env.GITHUB_TOKEN },
    { type: 'notion', token: process.env.NOTION_TOKEN },
    { type: 'web-crawler', urls: ['https://docs.example.com'] },
  ],

  plugins: ['@opendocuments/parser-pdf', '@opendocuments/parser-docx'],

  security: {
    dataPolicy: {
      autoRedact: { enabled: true, patterns: ['email', 'phone', 'credit-card'] },
    },
    audit: { enabled: true },
  },

  storage: { db: 'sqlite', vectorDb: 'lancedb', dataDir: '~/.opendocuments' },
})
```

---

## Docker Deployment

```bash
# Basic (cloud LLM)
docker compose up -d

# With local LLM (Ollama)
docker compose --profile with-ollama up -d

# With .env file for API keys
docker compose --env-file .env up -d
```

The Docker image includes all packages and plugins. Data persists in a named volume. Mount your config:

```bash
docker run -v ./opendocuments.config.ts:/app/opendocuments.config.ts \
  -v opendocuments-data:/data -p 3000:3000 opendocuments
```

---

## Plugin Development

Create custom parsers, connectors, or model providers:

```bash
opendocuments plugin create my-parser --type parser
cd my-parser
npm install
npm run test
npm run dev       # Watch mode
opendocuments plugin publish  # Publish to npm
```

Four plugin types: `parser`, `connector`, `model`, `middleware`. Each has a typed interface with lifecycle hooks (`setup`, `teardown`, `healthCheck`, `metrics`).

Community plugins follow the naming convention: `opendocuments-plugin-*`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full plugin development guide.

---

## TypeScript SDK

```typescript
import { OpenDocumentsClient } from '@opendocuments/client'

const client = new OpenDocumentsClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'od_live_...',
})

const result = await client.ask('How does auth work?')
console.log(result.answer)    // "Auth uses JWT tokens with..."
console.log(result.sources)   // [{ sourcePath: 'docs/auth.md', score: 0.92 }]
console.log(result.confidence) // { level: 'high', score: 0.87 }
```

---

## Embeddable Widget

Add a chat widget to your internal tools:

```html
<script src="http://localhost:3000/widget.js"></script>
<script>
  OpenDocuments.widget({
    server: 'http://localhost:3000',
    apiKey: 'od_live_...',
    workspace: 'public-docs',
  })
</script>
```

---

## Development

```bash
git clone https://github.com/joungminsung/OpenDocuments.git
cd OpenDocuments
npm run setup    # Install + build (one command)
npm run test     # 51 test suites, ~300 tests
npm run dev      # Watch mode
```

### Architecture

| Package | Role | Tests |
|---------|------|-------|
| `@opendocuments/core` | Plugin system, RAG engine, ingest pipeline, storage, auth, security | 159 |
| `@opendocuments/server` | HTTP API (Hono), MCP server, auth middleware, widget | 27 |
| `@opendocuments/cli` | 17 CLI commands (Commander.js) | 3 |
| `@opendocuments/web` | React SPA with 7 pages (Vite + Tailwind) | -- |
| `@opendocuments/client` | TypeScript SDK | 3 |
| 8 model plugins | Ollama, OpenAI, Anthropic, Google, Grok, DeepSeek, Mistral, OpenAI-compatible | 41 |
| 9 parser plugins | PDF, DOCX, XLSX, HTML, Jupyter, Email, Code, PPTX, Structured | 37 |
| 8 connector plugins | GitHub, Notion, GDrive, S3, Confluence, Swagger, WebCrawler, WebSearch | 38 |

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions, test patterns, and plugin development guide.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Quick Start](#quick-start) | Install and run in 5 minutes |
| [Architecture](docs-site/guide/architecture.md) | Package structure, data flow, design decisions |
| [Plugin API: Parsers](docs-site/plugins/parser-api.md) | Create custom document parsers |
| [Plugin API: Connectors](docs-site/plugins/connector-api.md) | Connect external data sources |
| [Plugin API: Models](docs-site/plugins/model-api.md) | Add custom AI providers |
| [TypeScript SDK](docs-site/sdk/guide.md) | Programmatic API client |
| [Security Policy](SECURITY.md) | Vulnerability reporting |
| [Contributing](CONTRIBUTING.md) | Development setup, conventions, plugin guide |

---

## License

[MIT](LICENSE)
