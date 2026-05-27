# OpenDocuments Architecture

[English](architecture.md) | [한국어](architecture.ko.md)

OpenDocuments is a self-hosted RAG platform for searching private documents across GitHub, Notion, Google Drive, local files, and other sources.

The system is designed around three principles:

- **Core-first design**: business logic lives in `@opendocuments/core`, while CLI, server, web, and SDK layers reuse it.
- **Plugin-first extension**: connectors, parsers, and model providers are independent plugins.
- **Source-grounded retrieval**: answers are generated from retrieved document context and returned with source references.

## System Overview

```mermaid
flowchart LR
  subgraph Sources["Document Sources"]
    GH["GitHub"]
    NO["Notion"]
    GD["Google Drive"]
    LF["Local Files"]
    WS["Web / S3 / Confluence"]
  end

  subgraph Plugins["Plugin Layer"]
    CON["Connector Plugins"]
    PAR["Parser Plugins"]
    MOD["Model Provider Plugins"]
  end

  subgraph Core["@opendocuments/core"]
    ING["Ingest Pipeline"]
    RAG["RAG Engine"]
    AUTH["Auth / Security"]
    BUS["Typed Event Bus"]
  end

  subgraph Storage["Storage"]
    SQL[("SQLite\nmetadata + FTS5")]
    VEC[("LanceDB\nvectors")]
  end

  subgraph Interfaces["Interfaces"]
    CLI["CLI"]
    API["HTTP API"]
    WEB["Web UI"]
    SDK["TypeScript SDK"]
    MCP["MCP Server"]
  end

  GH --> CON
  NO --> CON
  GD --> CON
  LF --> CON
  WS --> CON
  CON --> ING
  ING --> PAR
  ING --> SQL
  ING --> VEC
  CLI --> RAG
  API --> RAG
  WEB --> RAG
  SDK --> RAG
  MCP --> RAG
  RAG --> SQL
  RAG --> VEC
  RAG --> MOD
  RAG --> API
  RAG --> CLI
  AUTH --> API
  BUS --> ING
  BUS --> RAG
```

## Monorepo Layout

```mermaid
flowchart TB
  ROOT["OpenDocuments Monorepo"]

  ROOT --> PKG["packages/"]
  ROOT --> PLG["plugins/"]
  ROOT --> DOCS["docs-site/"]

  PKG --> CORE["core\nRAG, ingest, storage, auth, plugins"]
  PKG --> SERVER["server\nHono HTTP API, MCP server"]
  PKG --> CLI["cli\nCommander.js commands"]
  PKG --> WEB["web\nReact + Vite UI"]
  PKG --> CLIENT["client\nTypeScript SDK"]

  PLG --> MODEL["model-*\nOllama, OpenAI, Anthropic, Google, Grok"]
  PLG --> PARSER["parser-*\nPDF, DOCX, XLSX, HTML, Code, PPTX"]
  PLG --> CONNECTOR["connector-*\nGitHub, Notion, GDrive, S3, Web"]

  DOCS --> SITE["VitePress documentation"]
```

`@opendocuments/core` is the center of the architecture. It exposes reusable APIs for ingest, retrieval, storage, authentication, and plugins. The outer packages are protocol or user-interface layers.

## Ingest Pipeline

The ingest pipeline converts external documents into searchable metadata and embeddings.

```mermaid
sequenceDiagram
  participant Source as Document Source
  participant Connector as Connector Plugin
  participant Parser as Parser Plugin
  participant Ingest as Ingest Pipeline
  participant Model as Embedding Provider
  participant SQLite as SQLite / FTS5
  participant LanceDB as LanceDB

  Source->>Connector: discover and fetch documents
  Connector->>Parser: pass file or raw content
  Parser->>Ingest: normalized document text
  Ingest->>Ingest: structure-aware chunking
  Ingest->>Model: generate embeddings
  Ingest->>SQLite: store metadata and keyword index
  Ingest->>LanceDB: store vectors and chunk payloads
```

Key responsibilities:

- Normalize documents from different sources into a common document model.
- Preserve useful structure such as headings, sections, and code blocks.
- Store metadata in SQLite and vector payloads in LanceDB.
- Keep parser and connector logic outside the core pipeline through plugins.

## RAG Pipeline

OpenDocuments uses a retrieval pipeline that combines semantic search, keyword search, query expansion, reranking, and grounding checks.

```mermaid
flowchart LR
  Q["User Question"] --> INT["Intent Classification"]
  INT --> EXP["Query Expansion\nHyDE / Multi-query"]
  EXP --> DENSE["Vector Search\nLanceDB"]
  EXP --> SPARSE["Keyword Search\nSQLite FTS5"]
  DENSE --> RRF["RRF Merge"]
  SPARSE --> RRF
  RRF --> PARENT["Parent Context\nDocument Expansion"]
  PARENT --> RERANK["Rerank Results"]
  RERANK --> FIT["Context Fitting"]
  FIT --> GEN["Answer Generation"]
  GEN --> GROUND["Grounding Check"]
  GROUND --> OUT["Answer + Sources\nConfidence"]
```

Important retrieval features:

- **Hybrid search**: combines dense vector search with SQLite FTS5 keyword search.
- **RRF merge**: merges dense and sparse search results with Reciprocal Rank Fusion.
- **HyDE and multi-query**: expands difficult questions into better retrieval queries.
- **Parent document retrieval**: restores broader section context around matching chunks.
- **Reranking**: improves final context selection before generation.
- **Grounding check**: verifies that generated answers are supported by retrieved sources.

## Plugin Architecture

Plugins let OpenDocuments add new models, document formats, and external sources without changing the core RAG pipeline.

```mermaid
flowchart TB
  subgraph Core["Core Plugin Contracts"]
    C["ConnectorPlugin"]
    P["ParserPlugin"]
    M["ModelPlugin"]
  end

  subgraph Connectors["Connector Plugins"]
    CGH["GitHub"]
    CNO["Notion"]
    CGD["Google Drive"]
    CWEB["Web Crawler / Search"]
  end

  subgraph Parsers["Parser Plugins"]
    PPDF["PDF"]
    PDOCX["DOCX"]
    PXLSX["XLSX"]
    PCODE["Code"]
    PPPTX["PPTX"]
  end

  subgraph Models["Model Provider Plugins"]
    MO["Ollama"]
    MOP["OpenAI"]
    MA["Anthropic"]
    MG["Google"]
    MX["Grok"]
  end

  C --> CGH
  C --> CNO
  C --> CGD
  C --> CWEB
  P --> PPDF
  P --> PDOCX
  P --> PXLSX
  P --> PCODE
  P --> PPPTX
  M --> MO
  M --> MOP
  M --> MA
  M --> MG
  M --> MX
```

This keeps the core package focused on orchestration and contracts, while plugin packages own provider-specific behavior.

## Storage Design

OpenDocuments uses two storage layers because metadata search and vector search have different access patterns.

| Layer | Technology | Purpose |
| --- | --- | --- |
| Metadata store | SQLite | workspaces, documents, chunks, jobs, auth data |
| Keyword index | SQLite FTS5 | sparse keyword search and exact-match retrieval |
| Vector store | LanceDB | embeddings and semantic similarity search |

This design keeps local self-hosted setup simple while preserving a clear path to swap storage implementations later.

## Interface Layers

```mermaid
flowchart LR
  CORE["@opendocuments/core"]

  CLI["CLI\nopendocuments"]
  SERVER["Server\nHono HTTP API"]
  WEB["Web UI\nReact + Vite"]
  CLIENT["Client SDK\nTypeScript"]
  MCP["MCP Server\nAI assistant access"]

  CLI --> CORE
  SERVER --> CORE
  WEB --> SERVER
  CLIENT --> SERVER
  MCP --> CORE
```

Interface layers are intentionally thin:

- CLI exposes local commands for setup, indexing, asking, diagnostics, and backup.
- Server exposes HTTP APIs, authentication middleware, MCP server, and widget endpoints.
- Web UI consumes server APIs for browser-based operation.
- TypeScript SDK gives external applications a typed API client.
- MCP server exposes the knowledge base to AI coding assistants.

## Security Considerations

Security-sensitive paths are handled close to the storage, server, and query layers:

- SQL queries use parameterized statements.
- SQLite FTS5 queries are escaped before execution.
- LanceDB filters are built through safe where-clause helpers.
- Team mode endpoints are protected by authentication middleware.
- Error responses avoid leaking stack traces or internal paths in production.

## Design Tradeoffs

| Decision | Why |
| --- | --- |
| SQLite + LanceDB | Simple self-hosted setup with separate metadata and vector search layers |
| Plugin-first architecture | New sources, parsers, and model providers can be added without changing core |
| Core-first monorepo | CLI, server, web, SDK, and MCP reuse the same business logic |
| Hono server layer | Lightweight TypeScript-friendly HTTP layer around core services |
| Retrieval profiles | Users can trade speed for quality with fast, balanced, and precise modes |
