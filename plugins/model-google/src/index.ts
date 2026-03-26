import type {
  ModelPlugin,
  PluginContext,
  HealthStatus,
  GenerateOpts,
  EmbeddingResult,
} from '@opendocs/core'
import { fetchWithTimeout } from '@opendocs/core'

export interface GoogleConfig {
  apiKey?: string
  llmModel?: string
  embeddingModel?: string
}

export class GoogleModelPlugin implements ModelPlugin {
  name = '@opendocs/model-google'
  type = 'model' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  capabilities = { llm: true, embedding: true, reranker: false, vision: false }

  private apiKey = ''
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  private llmModel = 'gemini-2.5-flash'
  private embeddingModel = 'text-embedding-004'

  private redactUrl(url: string): string {
    return url.replace(/key=[^&]+/, 'key=[REDACTED]')
  }

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as GoogleConfig
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY || ''
    if (config.llmModel) this.llmModel = config.llmModel
    if (config.embeddingModel) this.embeddingModel = config.embeddingModel
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.apiKey) return { healthy: false, message: 'GOOGLE_API_KEY not set' }
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`
      const res = await fetchWithTimeout(url, {}, 10000)
      return { healthy: res.ok, message: res.ok ? 'Connected' : `HTTP ${res.status} at ${this.redactUrl(url)}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *generate(prompt: string, opts?: GenerateOpts): AsyncIterable<string> {
    const contents = [{ role: 'user', parts: [{ text: prompt }] }]
    const systemInstruction = opts?.systemPrompt
      ? { parts: [{ text: opts.systemPrompt }] }
      : undefined

    const url = `${this.baseUrl}/models/${this.llmModel}:streamGenerateContent?alt=sse&key=${this.apiKey}`
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction,
        generationConfig: {
          temperature: opts?.temperature ?? 0.3,
          maxOutputTokens: opts?.maxTokens,
          stopSequences: opts?.stop,
        },
      }),
    }, 120000)

    if (!res.ok) throw new Error(`Google AI error: ${res.status} at ${this.redactUrl(url)}`)
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
          try {
            const parsed = JSON.parse(data)
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) yield text
          } catch {
            // skip malformed SSE data
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    // Process in batches of 5 to avoid rate limits
    const BATCH_SIZE = 5
    const allEmbeddings: number[][] = []

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (text) => {
          const url = `${this.baseUrl}/models/${this.embeddingModel}:embedContent?key=${this.apiKey}`
          const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: { parts: [{ text }] } }),
          }, 30000)
          if (!res.ok) throw new Error(`Google embed error: ${res.status} at ${this.redactUrl(url)}`)
          const data = await res.json() as { embedding: { values: number[] } }
          return data.embedding.values
        })
      )
      allEmbeddings.push(...results)
    }

    return { dense: allEmbeddings }
  }
}

// Default export for plugin loading
export default GoogleModelPlugin
