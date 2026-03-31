# OpenDocuments

**Open source RAG tool for AI document search** — connect GitHub, Notion, Google Drive and ask questions with cited answers.

[![CI](https://github.com/joungminsung/OpenDocuments/actions/workflows/ci.yml/badge.svg)](https://github.com/joungminsung/OpenDocuments/actions)
[![npm](https://img.shields.io/npm/v/opendocuments.svg)](https://www.npmjs.com/package/opendocuments)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/joungminsung/OpenDocuments/blob/main/LICENSE)

## Install

```bash
npm install -g opendocuments
```

## Quick Start

```bash
opendocuments init     # Auto-detects Ollama, pulls models, validates API keys
opendocuments start    # Web UI at http://localhost:3000
opendocuments index ./docs
opendocuments ask "How does authentication work?"
```

## What It Does

OpenDocuments connects your scattered documents and answers questions with AI:

- **10+ data sources** — GitHub, Notion, Google Drive, Confluence, S3, Swagger, web pages
- **12+ file formats** — PDF, DOCX, Excel, HTML, Jupyter, code, email, PowerPoint
- **Local or cloud AI** — Ollama (data stays local) or OpenAI, Claude, Gemini, Grok
- **Korean + English** — cross-lingual search finds docs regardless of language
- **MCP server** — works with Claude Code, Cursor, and any MCP-compatible AI tool

## CLI Commands

```bash
# Ask questions
opendocuments ask "query"              # Single question
opendocuments ask                      # Interactive REPL
opendocuments search "keyword" --top 5 # Vector search (no LLM)

# Documents
opendocuments index ./docs --watch     # Index + auto-reindex
opendocuments document list            # List indexed docs
opendocuments document delete <id>     # Soft-delete

# Connectors
opendocuments connector sync           # Sync all sources
opendocuments connector status         # Check sync status

# Server
opendocuments start                    # HTTP + Web UI
opendocuments start --mcp-only         # MCP server (stdio)
opendocuments stop                     # Stop server
opendocuments doctor                   # Health diagnostics

# Plugins
opendocuments plugin create my-parser --type parser
opendocuments plugin list
opendocuments plugin publish

# Admin
opendocuments auth create-key --name "bot" --role member
opendocuments export --output ./backup
```

## Configuration

`opendocuments init` generates `opendocuments.config.ts`:

```typescript
import { defineConfig } from 'opendocuments-core'

export default defineConfig({
  workspace: 'my-team',
  mode: 'personal',

  model: {
    provider: 'ollama',        // or 'openai', 'anthropic', 'google', 'grok'
    llm: 'qwen2.5:14b',
    embedding: 'bge-m3',
  },

  rag: { profile: 'balanced' },  // 'fast' | 'balanced' | 'precise'

  connectors: [
    { type: 'github', repo: 'org/repo', token: process.env.GITHUB_TOKEN },
    { type: 'notion', token: process.env.NOTION_TOKEN },
  ],

  plugins: [
    '@opendocuments/parser-pdf',
    '@opendocuments/parser-docx',
  ],
})
```

API keys are stored in `.env` and loaded automatically.

## MCP Server

Use OpenDocuments as a knowledge base for AI coding tools:

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

19 tools available: search, ask, index, document management, connector sync, stats.

## Docker

```bash
docker compose up -d                         # Cloud LLM
docker compose --profile with-ollama up -d   # Local LLM
```

## RAG Profiles

| | fast | balanced | precise |
|--|------|----------|---------|
| Speed | ~1s | ~3s | ~5s+ |
| Search depth | 10 docs | 20 docs | 50 docs |
| Reranking | Off | On | On |
| Cross-lingual | Off | KR + EN | KR + EN |
| Hallucination guard | Off | Checks | Strict |

## Links

- **GitHub**: https://github.com/joungminsung/OpenDocuments
- **Documentation**: https://joungminsung.github.io/OpenDocuments
- **Changelog**: https://github.com/joungminsung/OpenDocuments/releases
- **Issues**: https://github.com/joungminsung/OpenDocuments/issues
- **Security**: https://github.com/joungminsung/OpenDocuments/blob/main/SECURITY.md

## License

MIT
