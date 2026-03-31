---
layout: home
hero:
  name: OpenDocuments
  text: Open Source RAG Tool
  tagline: Self-hosted AI document search — connect your scattered docs and ask questions with source citations
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/joungminsung/OpenDocuments
features:
  - icon: "🔍"
    title: AI Document Search
    details: Ask questions in natural language across GitHub, Notion, Google Drive, Confluence, S3, and local files. Get cited answers, not hallucinations.
  - icon: "🏠"
    title: Self-Hosted Knowledge Base
    details: Your data never leaves your network. Run locally with Ollama or connect to OpenAI, Claude, Gemini, Grok. No vendor lock-in.
  - icon: "🔌"
    title: Plugin Ecosystem
    details: 22 built-in plugins for parsers (PDF, DOCX, code), connectors (GitHub, Notion), and AI models. Create your own in minutes.
  - icon: "🤖"
    title: MCP Server for AI Coding
    details: Use as a knowledge base for Claude Code, Cursor, or any MCP-compatible AI tool. 19 tools for AI-assisted workflows.
  - icon: "🌐"
    title: Cross-Lingual Search
    details: Find documents in Korean and English regardless of query language. Hybrid search combines semantic vectors with keyword matching.
  - icon: "🛡️"
    title: Enterprise Security
    details: Team mode with OAuth SSO, API key auth, PII redaction, audit logging, workspace isolation, and rate limiting.
---

## What is OpenDocuments?

OpenDocuments is an **open source RAG (Retrieval-Augmented Generation) tool** that connects your scattered organizational documents and lets you **search and ask questions using AI**.

Unlike cloud-only solutions, OpenDocuments can run **entirely on your own infrastructure** with local LLMs via Ollama — your data never leaves your network.

### Why OpenDocuments?

- **Open source alternative** to proprietary enterprise search and AI knowledge bases
- **Self-hosted RAG platform** with support for 12+ file formats and 10+ data sources
- **Production-ready** with multi-tenant workspaces, OAuth SSO, audit logging, and PII redaction
- **Developer-friendly** with TypeScript SDK, CLI, MCP server, and embeddable widget
- **Hybrid search** combining dense vector search (LanceDB) with sparse keyword search (SQLite FTS5) via Reciprocal Rank Fusion

### Quick Install

```bash
npm install -g opendocuments
opendocuments init
opendocuments start
```

[Get started →](/guide/)
