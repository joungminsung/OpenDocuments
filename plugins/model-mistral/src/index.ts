import type {
  ModelPlugin,
  PluginContext,
  HealthStatus,
  GenerateOpts,
  EmbeddingResult,
} from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface MistralConfig {
  apiKey?: string
  baseUrl?: string
  llmModel?: string
  embeddingModel?: string
}

/**
 * Mistral AI model plugin.
 *
 * Mistral exposes an OpenAI-compatible Chat Completions API plus a first-party
 * embeddings endpoint (`mistral-embed`, 1024-dim).
 *
 * Supported models (April 2026):
 *  - `mistral-small-latest`   — Mistral Small 4 MoE (default, multimodal + reasoning + code)
 *  - `mistral-large-latest`   — Mistral Large 2.1 (flagship reasoning)
 *  - `codestral-latest`       — code specialist
 *  - `pixtral-large-latest`   — legacy vision (deprecated, prefer Small 4)
 *
 * Embedding: `mistral-embed` (default, 1024 dimensions).
 */
export class MistralModelPlugin implements ModelPlugin {
  name = '@opendocuments/model-mistral'
  type = 'model' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  capabilities = { llm: true, embedding: true, reranker: false, vision: true }

  private apiKey = ''
  private baseUrl = 'https://api.mistral.ai/v1'
  private llmModel = 'mistral-small-latest'
  private embeddingModel = 'mistral-embed'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as MistralConfig
    this.apiKey = config.apiKey || process.env.MISTRAL_API_KEY || ''
    if (config.baseUrl) this.baseUrl = config.baseUrl
    if (config.llmModel) this.llmModel = config.llmModel
    if (config.embeddingModel) this.embeddingModel = config.embeddingModel
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.apiKey) return { healthy: false, message: 'MISTRAL_API_KEY not set' }
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      }, 10000)
      return { healthy: res.ok, message: res.ok ? 'Connected' : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *generate(prompt: string, opts?: GenerateOpts): AsyncIterable<string> {
    const messages: { role: string; content: string }[] = []
    if (opts?.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
    messages.push({ role: 'user', content: prompt })

    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.llmModel,
        messages,
        stream: true,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens,
        stop: opts?.stop,
      }),
    }, 120000)

    if (!res.ok) throw new Error(`Mistral error: ${res.status}`)
    if (!res.body) throw new Error('No response body')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') return
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) yield content
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const res = await fetchWithTimeout(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
      }),
    }, 30000)

    if (!res.ok) throw new Error(`Mistral embed error: ${res.status}`)
    const data = (await res.json()) as { data: { embedding: number[] }[] }
    return { dense: data.data.map((d) => d.embedding) }
  }
}

export default MistralModelPlugin
