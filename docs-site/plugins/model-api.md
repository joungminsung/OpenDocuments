# Model Plugin API

Model plugins provide LLM generation and/or embedding capabilities.

## Interface

```typescript
interface ModelPlugin extends OpenDocumentsPlugin {
  type: 'model'
  capabilities: { embedding?: boolean; llm?: boolean; reranking?: boolean }

  embed?(texts: string[]): Promise<EmbeddingResult>
  generate?(prompt: string, opts?: GenerateOpts): AsyncIterable<string>
  rerank?(query: string, documents: string[]): Promise<RerankResult>
}

interface EmbeddingResult {
  dense: number[][]  // One vector per input text
}

interface GenerateOpts {
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}
```

## Creating a Model Plugin

```bash
opendocuments plugin create my-model --type model
```

## Example: OpenAI-Compatible Provider

```typescript
import type { ModelPlugin, EmbeddingResult, GenerateOpts, PluginContext, HealthStatus } from 'opendocuments-core'

export default class MyModelPlugin implements ModelPlugin {
  name = 'my-model-plugin'
  type = 'model' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  capabilities = { embedding: true, llm: true }

  private apiKey = ''
  private baseUrl = ''

  async setup(ctx: PluginContext) {
    this.apiKey = (ctx.config as any).apiKey || ''
    this.baseUrl = (ctx.config as any).baseUrl || 'https://api.openai.com/v1'
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
    })
    const data = await res.json()
    return { dense: data.data.map((d: any) => d.embedding) }
  }

  async *generate(prompt: string, opts?: GenerateOpts): AsyncIterable<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: opts?.systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        stream: true,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 4096,
      }),
    })
    // Parse SSE stream...
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      // Parse and yield chunks...
      yield text
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      })
      return { healthy: res.ok, message: res.ok ? 'Connected' : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }
}
```

## Key Notes

- Set `capabilities` correctly - the system uses this to decide which plugin handles what
- `embed()` must return exactly one vector per input text
- `generate()` must be an async generator (use `yield`)
- Always implement `healthCheck()` for monitoring
- If your provider doesn't support embeddings, set `capabilities: { llm: true }` only

## Reference Plugins

- `model-ollama` (180 lines) - Local model, NDJSON streaming
- `model-openai` (150 lines) - Cloud API, SSE streaming
- `model-anthropic` (130 lines) - LLM-only (no embedding)
