# Configuration

OpenDocuments is configured via `opendocuments.config.ts` in your project root.

## Full Example

```typescript
import { defineConfig } from 'opendocuments-core'

export default defineConfig({
  workspace: 'my-team',
  mode: 'personal',        // 'personal' | 'team'

  model: {
    provider: 'ollama',     // 'ollama' | 'openai' | 'anthropic' | 'google' | 'grok' | 'deepseek' | 'mistral' | 'openai-compatible'
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
  llm: 'qwen2.5:14b',      // Any Ollama model: gemma3, gemma2, llama3.3, qwen2.5, phi4, deepseek-r1...
  embedding: 'bge-m3',
  baseUrl: 'http://localhost:11434',  // Default
}
```

Popular Ollama models (April 2026):

```bash
# Google Gemma 4 (128K context, 140+ languages, multimodal)
ollama pull gemma3:27b   # Gemma 3 flagship
ollama pull gemma3:12b   # Balanced
ollama pull gemma3:4b    # Low-spec
ollama pull gemma3n      # Selective activation for laptops/phones
ollama pull gemma4       # Newest release (if available)

# Alibaba Qwen 3.5
ollama pull qwen2.5:14b
ollama pull qwen3.5:9b

# Meta Llama 4
ollama pull llama4:scout
ollama pull llama4:maverick

# DeepSeek R1 distilled
ollama pull deepseek-r1:14b
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

// DeepSeek (V3.2 / R1 — no embedding, cheapest reasoning)
model: {
  provider: 'deepseek',
  llm: 'deepseek-chat',        // or 'deepseek-reasoner' for R1
  embedding: 'bge-m3',
  embeddingProvider: 'ollama',
  apiKey: process.env.DEEPSEEK_API_KEY,
}

// Mistral (Small 4 / Large / Codestral / Pixtral)
model: {
  provider: 'mistral',
  llm: 'mistral-small-latest',  // MoE w/ reasoning + vision + code
  embedding: 'mistral-embed',
  apiKey: process.env.MISTRAL_API_KEY,
}

// Generic OpenAI-compatible — works with vLLM, LM Studio, Together, Fireworks, Groq, DeepInfra, SiliconFlow, OpenRouter
model: {
  provider: 'openai-compatible',
  baseUrl: 'https://api.groq.com/openai/v1',  // required
  llm: 'llama-4-70b-instruct',
  embedding: 'bge-m3',
  embeddingProvider: 'ollama',  // Groq has no embeddings
  apiKey: process.env.GROQ_API_KEY,
  // extraHeaders: { 'HTTP-Referer': 'https://myapp.com' },  // e.g. for OpenRouter
}

// Self-hosted vLLM
model: {
  provider: 'openai-compatible',
  baseUrl: 'http://vllm.internal:8000/v1',
  llm: 'meta-llama/Llama-4-70B-Instruct',
  embedding: 'BAAI/bge-m3',
  apiKey: '',  // vLLM accepts empty
}
```

## Environment Variables

API keys should be stored in `.env`, never in the config file:

```bash
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GROK_API_KEY=xai-...
DEEPSEEK_API_KEY=sk-...
MISTRAL_API_KEY=...
OPENAI_COMPATIBLE_API_KEY=...          # For generic openai-compatible provider
OPENAI_COMPATIBLE_BASE_URL=https://... # Optional default for openai-compatible baseUrl
GITHUB_TOKEN=ghp_...
NOTION_TOKEN=ntn_...
TAVILY_API_KEY=tvly-...                # For web search integration
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
  // Enables: API key auth, RBAC, workspace isolation, audit logging
})
```

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
