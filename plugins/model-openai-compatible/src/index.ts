import type {
  ModelPlugin,
  PluginContext,
  HealthStatus,
  GenerateOpts,
  EmbeddingResult,
} from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface OpenAICompatibleConfig {
  apiKey?: string
  /** Required. Base URL of the OpenAI-compatible endpoint (include /v1 suffix if applicable). */
  baseUrl?: string
  llmModel?: string
  embeddingModel?: string
  /** Disable embedding even if the endpoint supports it (useful when pairing with another embedder). */
  disableEmbedding?: boolean
  /** Extra headers to attach to every request (e.g. `HTTP-Referer` for OpenRouter). */
  extraHeaders?: Record<string, string>
}

/**
 * Generic OpenAI-compatible model plugin.
 *
 * Works with any provider that exposes the OpenAI Chat Completions and
 * (optionally) Embeddings API shape:
 *  - vLLM  (`http://localhost:8000/v1`)
 *  - LM Studio (`http://localhost:1234/v1`)
 *  - Together AI (`https://api.together.xyz/v1`)
 *  - Fireworks (`https://api.fireworks.ai/inference/v1`)
 *  - Groq (`https://api.groq.com/openai/v1`) — LLM only
 *  - DeepInfra (`https://api.deepinfra.com/v1/openai`)
 *  - SiliconFlow (`https://api.siliconflow.cn/v1`)
 *  - OpenRouter (`https://openrouter.ai/api/v1`)
 *
 * Configure via `opendocuments.config.ts`:
 * ```ts
 * model: {
 *   provider: 'openai-compatible',
 *   apiKey: process.env.MY_API_KEY,
 *   baseUrl: 'https://api.groq.com/openai/v1',
 *   llm: 'llama-4-70b-instruct',
 *   embedding: 'bge-m3',
 *   embeddingProvider: 'ollama', // groq doesn't embed — fall back to local
 * }
 * ```
 */
export class OpenAICompatibleModelPlugin implements ModelPlugin {
  name = '@opendocuments/model-openai-compatible'
  type = 'model' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  capabilities = { llm: true, embedding: true, reranker: false, vision: false }

  private apiKey = ''
  private baseUrl = ''
  private llmModel = ''
  private embeddingModel = ''
  private extraHeaders: Record<string, string> = {}

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as OpenAICompatibleConfig
    this.apiKey = config.apiKey || process.env.OPENAI_COMPATIBLE_API_KEY || ''
    this.baseUrl = config.baseUrl || process.env.OPENAI_COMPATIBLE_BASE_URL || ''
    this.llmModel = config.llmModel || ''
    this.embeddingModel = config.embeddingModel || ''
    if (config.extraHeaders) this.extraHeaders = config.extraHeaders
    if (config.disableEmbedding) {
      this.capabilities = { ...this.capabilities, embedding: false }
    }
    if (!this.baseUrl) {
      throw new Error(
        'model-openai-compatible requires a baseUrl (e.g. https://api.groq.com/openai/v1). ' +
        'Set it in opendocuments.config.ts `model.baseUrl` or OPENAI_COMPATIBLE_BASE_URL env var.',
      )
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...this.extraHeaders, ...extra }
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`
    return h
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/models`, {
        headers: this.headers(),
      }, 10000)
      return {
        healthy: res.ok,
        message: res.ok ? `Connected to ${this.baseUrl}` : `HTTP ${res.status}`,
      }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *generate(prompt: string, opts?: GenerateOpts): AsyncIterable<string> {
    if (!this.llmModel) throw new Error('openai-compatible: llmModel is not configured')

    const messages: { role: string; content: string }[] = []
    if (opts?.systemPrompt) messages.push({ role: 'system', content: opts.systemPrompt })
    messages.push({ role: 'user', content: prompt })

    const res = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: this.llmModel,
        messages,
        stream: true,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens,
        stop: opts?.stop,
      }),
    }, 180000)

    if (!res.ok) throw new Error(`openai-compatible error (${this.baseUrl}): ${res.status}`)
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
    if (!this.embeddingModel) {
      throw new Error('openai-compatible: embeddingModel is not configured')
    }
    const res = await fetchWithTimeout(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
      }),
    }, 30000)

    if (!res.ok) throw new Error(`openai-compatible embed error (${this.baseUrl}): ${res.status}`)
    const data = (await res.json()) as { data: { embedding: number[] }[] }
    return { dense: data.data.map((d) => d.embedding) }
  }
}

export default OpenAICompatibleModelPlugin
