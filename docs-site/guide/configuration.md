# Configuration

OpenDocuments is configured via `opendocuments.config.ts` in your project root.

## Full Example

```typescript
import { defineConfig } from 'opendocuments-core'

export default defineConfig({
  workspace: 'my-team',
  mode: 'personal',        // 'personal' | 'team'

  model: {
    provider: 'ollama',     // 'ollama' | 'openai' | 'anthropic' | 'google' | 'grok'
    llm: 'qwen2.5:14b',
    embedding: 'bge-m3',
    // embeddingProvider: 'openai',    // Use different provider for embeddings
    // apiKey: process.env.OPENAI_API_KEY,
    // baseUrl: 'http://localhost:11434',
  },

  rag: {
    profile: 'balanced',    // 'fast' | 'balanced' | 'precise' | 'custom'
    // custom: {
    //   retrieval: { k: 30, minScore: 0.3, finalTopK: 8 },
    //   context: { maxTokens: 8192, historyMaxTokens: 2048 },
    // },
  },

  connectors: [
    { type: 'github', repo: 'org/repo', token: process.env.GITHUB_TOKEN },
    { type: 'notion', token: process.env.NOTION_TOKEN },
    { type: 'gdrive', credentials: process.env.GDRIVE_CREDENTIALS },
    { type: 'confluence', baseUrl: 'https://wiki.company.com', token: process.env.CONFLUENCE_TOKEN },
    { type: 'web-crawler', urls: ['https://docs.example.com'] },
  ],

  plugins: [
    '@opendocuments/parser-pdf',
    '@opendocuments/parser-docx',
    '@opendocuments/parser-xlsx',
    '@opendocuments/connector-github',
  ],

  security: {
    dataPolicy: {
      autoRedact: {
        enabled: true,
        patterns: ['email', 'phone', 'credit-card'],
        method: 'replace',       // 'replace' | 'hash' | 'remove'
      },
    },
    transport: {
      enforceHTTPS: true,
      // Comma-separated proxy IPs/CIDRs; forwarded headers from other peers are ignored.
      proxy: '10.0.0.10,172.18.0.0/16',
      allowedOrigins: ['https://docs.example.com'],
    },
    audit: { enabled: true },
  },

  ui: {
    locale: 'auto',        // 'auto' | 'en' | 'ko'
    theme: 'auto',         // 'auto' | 'light' | 'dark'
  },

  storage: {
    db: 'sqlite',
    vectorDb: 'lancedb',
    dataDir: '~/.opendocuments',
  },
})
```

## Model Configuration

### Local Models (Ollama)

```typescript
model: {
  provider: 'ollama',
  llm: 'qwen2.5:14b',      // Any Ollama model
  embedding: 'bge-m3',
  baseUrl: 'http://localhost:11434',  // Default
}
```

### Cloud Models

```typescript
// OpenAI
model: {
  provider: 'openai',
  llm: 'gpt-4o',
  embedding: 'text-embedding-3-small',
  apiKey: process.env.OPENAI_API_KEY,
}

// Anthropic (no embedding — needs secondary provider)
model: {
  provider: 'anthropic',
  llm: 'claude-sonnet-4-20250514',
  embedding: 'bge-m3',
  embeddingProvider: 'ollama',
  apiKey: process.env.ANTHROPIC_API_KEY,
}

// Google
model: {
  provider: 'google',
  llm: 'gemini-2.5-flash',
  embedding: 'text-embedding-004',
  apiKey: process.env.GOOGLE_API_KEY,
}
```

## Environment Variables

API keys should be stored in `.env`, never in the config file:

```bash
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
NOTION_TOKEN=ntn_...
TAVILY_API_KEY=tvly-...    # For web search integration
```

The `.env` file is automatically loaded before config resolution.

## RAG Profiles

| | fast | balanced | precise |
|--|------|----------|---------|
| **Speed** | ~1s | ~3s | ~5s+ |
| **Search depth** | 10 docs | 20 docs | 50 docs |
| **Reranking** | Off | On | On |
| **Cross-lingual** | Off | KR + EN | KR + EN |
| **Query decomposition** | Off | Off | On |
| **Web search** | Off | Fallback | Always |
| **Hallucination guard** | Off | Checks | Strict |

## Team Mode

```typescript
export default defineConfig({
  mode: 'team',
  security: {
    transport: {
      enforceHTTPS: true,
      // Set this when TLS terminates at a reverse proxy. Use only IPs/CIDRs
      // controlled by your deployment; untrusted X-Forwarded-* headers are ignored.
      proxy: '10.0.0.10,172.18.0.0/16',
    },
  },
  // Enables: API key auth, RBAC, workspace isolation, audit logging
})
```

Container liveness probes use the unauthenticated `/healthz` endpoint. Detailed
health and readiness endpoints under `/api/v1` continue to require authentication
in team mode.

Create API keys:

```bash
opendocuments auth create-key --name "ci-bot" --role member
# Output: od_live_abc123... (save this — shown only once)
```

Use in requests:

```bash
curl -H "X-API-Key: od_live_abc123..." http://localhost:3000/api/v1/chat \
  -d '{"query": "How does auth work?"}'
```
