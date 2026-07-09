# Architecture

OpenDocuments is a TypeScript monorepo.

Main packages:

- `packages/core`: business logic, RAG pipeline, document ingest, storage, auth, plugin registry, connectors, parsers, event bus, and security utilities.
- `packages/server`: Hono HTTP API, MCP server, auth middleware, rate limiting, and static web serving.
- `packages/cli`: Commander.js CLI with operational commands.
- `packages/web`: React and Vite single-page application.
- `packages/client`: TypeScript SDK.

Plugin families:

- Model plugins: Ollama, OpenAI, Anthropic, Google, and Grok.
- Parser plugins: PDF, DOCX, XLSX, HTML, Jupyter, email, code, PPTX, and built-in text formats.
- Connector plugins: GitHub, Notion, Google Drive, S3, Confluence, Swagger, web crawler, and web search.

Storage:

- SQLite stores metadata, workspaces, documents, chunks, conversations, API keys, audit data, collections, and tags.
- LanceDB stores vector embeddings for semantic retrieval.
- FTS5 provides keyword search over indexed chunks.

The server is intentionally thin. Most behavior lives in core so the CLI, HTTP API, Web UI, SDK, and MCP server use the same underlying logic.
