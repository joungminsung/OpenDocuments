import type {
  ModelPlugin,
  PluginContext,
  HealthStatus,
  GenerateOpts,
  EmbeddingResult,
} from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface GoogleConfig {
  apiKey?: string
  llmModel?: string
  embeddingModel?: string
  thinkingBudget?: number
}

export class GoogleModelPlugin implements ModelPlugin {
  name = '@opendocuments/model-google'
  type = 'model' as const
  version = '0.1.1'
  coreVersion = '^0.3.0'
  capabilities = { llm: true, embedding: true, reranker: false, vision: false }

  private apiKey = ''
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'
  private llmModel = 'gemini-2.5-flash'
  private embeddingModel = 'gemini-embedding-001'
  private thinkingBudget = 0

  private redactUrl(url: string): string {
    return url.replace(/key=[^&]+/, 'key=[REDACTED]')
  }

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as GoogleConfig
    this.apiKey = config.apiKey || process.env.GOOGLE_API_KEY || ''
    if (config.llmModel) this.llmModel = config.llmModel
    if (config.embeddingModel) this.embeddingModel = config.embeddingModel
    if (config.thinkingBudget !== undefined) {
      this.thinkingBudget = config.thinkingBudget
    } else {
      const envThinkingBudget = process.env.OPENDOCUMENTS_MODEL_THINKING_BUDGET
      if (envThinkingBudget !== undefined && envThinkingBudget.trim() !== '') {
        const parsed = Number(envThinkingBudget)
        if (Number.isFinite(parsed)) this.thinkingBudget = parsed
      }
    }
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

    const url = `${this.baseUrl}/models/${this.llmModel}:generateContent?key=${this.apiKey}`
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
          thinkingConfig: { thinkingBudget: this.thinkingBudget },
        },
      }),
    }, 120000)

    if (!res.ok) throw new Error(`Google AI error: ${res.status} at ${this.redactUrl(url)}`)
    const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim()
    if (text) yield text
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
