---
layout: home
title: Self-Hosted RAG Platform for AI Document Search
description: OpenDocuments is an open source self-hosted RAG platform for AI document search across GitHub, Notion, Google Drive, Confluence, S3, local files, and web sources.
hero:
  name: OpenDocuments
  text: Self-Hosted RAG Platform
  tagline: AI document search across GitHub, Notion, Google Drive, Confluence, S3, local files, and web sources with source citations
  actions:
    - theme: brand
      text: Get Started
      link: /guide/
    - theme: alt
      text: What is OpenDocuments?
      link: /guide/what-is-opendocuments
    - theme: alt
      text: Compare Options
      link: /guide/comparisons
features:
  - icon:
      src: /icons/search.svg
    title: AI Document Search
    details: Ask questions in natural language across GitHub, Notion, Google Drive, Confluence, S3, and local files. Get cited answers with source links — not hallucinations.
  - icon:
      src: /icons/server.svg
    title: Self-Hosted Knowledge Base
    details: Your data never leaves your network. Run locally with Ollama or connect to OpenAI, Claude, Gemini, Grok. Zero cloud dependency, zero vendor lock-in.
  - icon:
      src: /icons/plugin.svg
    title: Plugin Ecosystem
    details: 22 built-in plugins — 9 parsers (PDF, DOCX, code, Jupyter), 8 connectors (GitHub, Notion, Drive), 5 AI models. Create your own with one CLI command.
  - icon:
      src: /icons/robot.svg
    title: MCP Server for AI Coding
    details: Works as a knowledge base for Claude Code, Cursor, Windsurf, and any MCP-compatible tool. 19 tools for search, indexing, and admin.
  - icon:
      src: /icons/globe.svg
    title: Cross-Lingual Search
    details: Find Korean docs with English queries and vice versa. Hybrid search combines semantic vectors (LanceDB) with keyword matching (SQLite FTS5) via Reciprocal Rank Fusion.
  - icon:
      src: /icons/shield.svg
    title: Enterprise Security
    details: Team mode with OAuth SSO (Google, GitHub), API key auth with RBAC, automatic PII redaction, audit logging, workspace isolation, and per-key rate limiting.
---

## What is OpenDocuments?

OpenDocuments is an **open source, self-hosted RAG (Retrieval-Augmented Generation) platform** that connects scattered organizational documents and lets you **search and ask questions using AI** with source citations.

Unlike cloud-only solutions, OpenDocuments can run **entirely on your own infrastructure** with local LLMs via Ollama. Your data can stay inside your network.

### Why OpenDocuments?

| Feature | OpenDocuments | Cloud alternatives |
|---------|--------------|-------------------|
| **Data privacy** | Runs locally, data never leaves your network | Data sent to third-party servers |
| **Cost** | Free, open source (MIT) | $20-100+/user/month |
| **File formats** | 12+ formats (PDF, DOCX, code, Jupyter...) | Limited format support |
| **Data sources** | 10+ connectors (GitHub, Notion, Drive...) | Vendor-specific integrations |
| **Customization** | Plugin system, full source access | Closed source, limited APIs |
| **AI models** | Any model (Ollama, OpenAI, Claude, Gemini) | Locked to one provider |
| **Korean support** | Built-in cross-lingual search | Usually English-only |

### Popular searches OpenDocuments answers

- What is the best open source RAG platform for internal documents?
- How do I build self-hosted AI document search with citations?
- How can Claude Code or Cursor search our company knowledge base?
- What is the difference between a RAG platform and a vector database?
- Can I run private document Q&A with Ollama?

### Quick Install

```bash
npm install -g opendocuments
opendocuments init    # Auto-detects Ollama, pulls models
opendocuments start   # Opens Web UI at localhost:3000
```

Three commands. Under 5 minutes. [Get started →](/guide/)

### Learn more

- [What is OpenDocuments?](/guide/what-is-opendocuments)
- [OpenDocuments comparisons](/guide/comparisons)
- [Self-hosted RAG with Ollama](/guide/self-hosted-rag-ollama)
- [MCP knowledge base for Claude Code and Cursor](/guide/mcp-knowledge-base)
