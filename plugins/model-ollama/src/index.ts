import type {
  ModelPlugin,
  PluginContext,
  HealthStatus,
  GenerateOpts,
  EmbeddingResult,
} from 'opendocuments-core'
import { fetchWithTimeout } from 'opendocuments-core'

export interface OllamaConfig {
  baseUrl?: string
  llmModel?: string
  embeddingModel?: string
}

export class OllamaModelPlugin implements ModelPlugin {
  name = '@opendocuments/model-ollama'
  type = 'model' as const
  version = '0.1.3'
  coreVersion = '^0.3.0'
  capabilities = { llm: true, embedding: true, reranker: false, vision: false }

  private baseUrl = 'http://localhost:11434'
  private llmModel = 'qwen2.5:14b'
  private embeddingModel = 'bge-m3'

  async setup(ctx: PluginContext): Promise<void> {
    const config = ctx.config as OllamaConfig
    if (config.baseUrl) this.baseUrl = config.baseUrl
    if (config.llmModel) this.llmModel = config.llmModel
    if (config.embeddingModel) this.embeddingModel = config.embeddingModel
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const res = await fetchWithTimeout(`${this.baseUrl}/api/tags`, {}, 10000)
      if (!res.ok) {
        return { healthy: false, message: `Ollama returned ${res.status}` }
      }
      return { healthy: true, message: `Connected to ${this.baseUrl}` }
    } catch {
      return { healthy: false, message: `Cannot connect to Ollama at ${this.baseUrl}` }
    }
  }

  async *generate(prompt: string, opts?: GenerateOpts): AsyncIterable<string> {
    const options = {
      temperature: opts?.temperature ?? 0.3,
      num_predict: opts?.maxTokens || 4096,  // Large default for thinking models (Qwen 3.5)
      stop: opts?.stop,
    }

    // Use chat endpoint when systemPrompt is provided
    if (opts?.systemPrompt) {
      yield* this.streamChat(prompt, opts.systemPrompt, options)
      return
    }

    // Simple generate endpoint
    const body = {
      model: this.llmModel,
      prompt,
      stream: true,
      options,
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 120000)

    if (!res.ok) throw new Error(`Ollama generate error: ${res.status}`)
    if (!res.body) throw new Error('No response body')

    for await (const chunk of this.parseNdjsonStream(res.body)) {
      // Qwen 3.5+ uses thinking mode: response may be empty while model thinks
      if (chunk.response) yield chunk.response
    }

  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    const res = await fetchWithTimeout(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: texts,
      }),
    }, 30000)

    if (!res.ok) throw new Error(`Ollama embed error: ${res.status}`)
    const data = (await res.json()) as { embeddings: number[][] }

    return { dense: data.embeddings }
  }

  // --- Private helpers ---

  private async *streamChat(
    prompt: string,
    systemPrompt: string,
    options: Record<string, unknown>,
  ): AsyncIterable<string> {
    const body = {
      model: this.llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: true,
      options,
    }

    const res = await fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 120000)

    if (!res.ok) throw new Error(`Ollama chat error: ${res.status}`)
    if (!res.body) throw new Error('No response body')

    for await (const chunk of this.parseNdjsonStream(res.body)) {
      if (chunk.message?.content) yield chunk.message.content
    }
  }

  private async *parseNdjsonStream(
    body: ReadableStream<Uint8Array>,
  ): AsyncIterable<Record<string, any>> {
    const reader = body.getReader()
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
          if (!line.trim()) continue
          try {
            yield JSON.parse(line)
          } catch {
            // skip malformed lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        try {
          yield JSON.parse(buffer)
        } catch {
          // skip
        }
      }
    } finally {
      reader.releaseLock()
    }
  }
}

// Default export for plugin loading
export default OllamaModelPlugin
