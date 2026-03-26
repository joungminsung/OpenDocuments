import type { ModelPlugin, PluginContext, HealthStatus, GenerateOpts } from '@opendocs/core'
import { fetchWithTimeout } from '@opendocs/core'

export interface AnthropicConfig {
  apiKey?: string
  baseUrl?: string
  llmModel?: string
  /** @deprecated use llmModel */
  model?: string
}

export class AnthropicModelPlugin implements ModelPlugin {
  name = '@opendocs/model-anthropic'
  type = 'model' as const
  version = '0.1.0'
  coreVersion = '^0.1.0'
  capabilities = { llm: true, embedding: false, reranker: false, vision: false }

  private apiKey = ''
  private baseUrl = 'https://api.anthropic.com/v1'
  private model = 'claude-sonnet-4-20250514'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as AnthropicConfig
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || ''
    if (config.baseUrl) this.baseUrl = config.baseUrl
    if (config.llmModel) this.model = config.llmModel
    else if (config.model) this.model = config.model
  }

  async healthCheck(): Promise<HealthStatus> {
    if (!this.apiKey) return { healthy: false, message: 'ANTHROPIC_API_KEY not set' }
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/models`, {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
      }, 10000)
      return { healthy: res.ok, message: res.ok ? 'Connected' : `HTTP ${res.status}` }
    } catch (err) {
      return { healthy: false, message: (err as Error).message }
    }
  }

  async *generate(prompt: string, opts?: GenerateOpts): AsyncIterable<string> {
    const messages = [{ role: 'user' as const, content: prompt }]

    const res = await fetchWithTimeout(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        system: opts?.systemPrompt,
        stream: true,
        max_tokens: opts?.maxTokens || 4096,
        temperature: opts?.temperature ?? 0.3,
      }),
    }, 120000)

    if (!res.ok) throw new Error(`Anthropic error: ${res.status}`)
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
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              yield parsed.delta.text
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

export default AnthropicModelPlugin
