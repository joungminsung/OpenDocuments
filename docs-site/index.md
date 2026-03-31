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

OpenDocuments is an **open source RAG (Retrieval-Augmented Generation) tool** that connects your scattered organizational documents and lets you **search and ask questions using AI** — with source citations so you know exactly where the answer came from.

Unlike cloud-only solutions, OpenDocuments runs **entirely on your own infrastructure** with local LLMs via Ollama. Your data never leaves your network.

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

### Quick Install

```bash
npm install -g opendocuments
opendocuments init    # Auto-detects Ollama, pulls models
opendocuments start   # Opens Web UI at localhost:3000
```

Three commands. Under 5 minutes. [Get started →](/guide/)
