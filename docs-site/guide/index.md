# Quick Start Guide

Get OpenDocuments running in under 5 minutes.

## Prerequisites

- **Node.js 20+** ([download](https://nodejs.org))
- **Ollama** (optional, for local LLM) — [download](https://ollama.com)

## Install

```bash
npm install -g opendocuments
```

## Initialize

```bash
opendocuments init
```

The wizard will:
1. Detect your hardware and recommend an LLM
2. Auto-detect Ollama and offer to pull missing models
3. Generate `opendocuments.config.ts` and `.env`

## Start the Server

```bash
opendocuments start
```

Open [http://localhost:3000](http://localhost:3000) — you'll see a chat UI, document manager, and admin dashboard.

## Index Documents

```bash
# Index a local directory
opendocuments index ./docs

# Watch mode (auto-reindex on changes)
opendocuments index ./docs --watch
```

Or drag-and-drop files in the Web UI.

## Ask Questions

```bash
# Single question
opendocuments ask "How does authentication work?"

# Interactive REPL
opendocuments ask

# With specific profile
opendocuments ask "Compare v2 vs v3 features" --profile precise
```

## Next Steps

- [Configuration](/guide/configuration) — customize models, connectors, and security
- [Architecture](/guide/architecture) — understand the system design
- [Plugin Development](/plugins/) — create custom parsers and connectors
- [Deployment](/guide/deployment) — Docker and production setup
- [TypeScript SDK](/sdk/guide) — programmatic access
