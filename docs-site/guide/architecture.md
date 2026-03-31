# Architecture Overview

OpenDocuments is a modular RAG platform organized as a monorepo.

## Package Structure

```
packages/
  core/     - RAG engine, storage, plugin system, ingest pipeline
  server/   - HTTP API (Hono), MCP server, bootstrap
  cli/      - Command-line interface (Commander.js)
  web/      - React SPA (Vite + Tailwind)
  client/   - TypeScript SDK
plugins/
  model-*   - AI model providers (Ollama, OpenAI, Anthropic, Google, Grok)
  parser-*  - Document format parsers (PDF, DOCX, HTML, Code, etc.)
  connector-* - External source connectors (GitHub, Notion, S3, etc.)
```

## Data Flow

```
Document Source → Connector (discover/fetch) → Parser (chunks)
  → Chunker (semantic split) → Embedder (vectors)
  → Storage (SQLite + LanceDB)

User Query → Embedder (query vector) → Retriever (dense + sparse search)
  → Reranker → Context Window Fitting → Generator (LLM)
  → Grounding Check → Response
```

## Key Design Decisions

### Plugin-First Architecture
All major functionality (models, parsers, connectors) is implemented as plugins. This allows:
- Independent versioning and publishing
- Community extensions without forking
- Graceful degradation (stub models if plugins fail)

### Hybrid Search (Dense + Sparse)
Combines vector similarity (LanceDB) with keyword matching (SQLite FTS5) via Reciprocal Rank Fusion. This handles both semantic and exact-match queries.

### Multi-Profile RAG
Three built-in profiles (fast/balanced/precise) trade off speed vs quality. Each profile configures: retrieval depth, reranking, cross-lingual expansion, and hallucination checking.

### Storage Abstraction
SQLite for metadata/FTS + LanceDB for vectors. Designed for single-machine deployment with optional scaling to Postgres + Qdrant.

## Contributing

See [CONTRIBUTING.md](https://github.com/joungminsung/OpenDocuments/blob/main/CONTRIBUTING.md) for development setup and guidelines.
See [Plugin System](/plugins/) for plugin development.
