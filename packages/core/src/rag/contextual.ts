import type { ModelPlugin } from '../plugin/interfaces.js'

export interface ChunkContextInput {
  /** The full source document (used as shared context for every chunk). */
  document: string
  /** The chunk texts for which to generate situating prefixes. */
  chunks: string[]
  /** An LLM capable of text generation via `generate(prompt, opts)`. */
  llm: ModelPlugin
  /** Max generated tokens per context (default: 100). */
  maxContextTokens?: number
  /** Optional abort signal. When aborted, pending chunks receive '' and the call returns. */
  signal?: AbortSignal
}

const SYSTEM_PROMPT = (doc: string): string => `You are a retrieval helper. You will be shown the full document below once, and then asked repeatedly about individual chunks of it. For each chunk, you must output a short, succinct piece of context (1-2 sentences max) that situates that chunk within the overall document. Answer with only the context line — no preamble, no quotes, no code fences.

<document>
${doc}
</document>`

const USER_PROMPT = (chunk: string): string => `<chunk>
${chunk}
</chunk>

Situating context:`

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const piece of stream) out += piece
  return out
}

/**
 * Generate a one- or two-sentence situating context per chunk. The document goes
 * into the model's systemPrompt so that adapters supporting prompt caching can
 * reuse it across the per-chunk calls. Returns an array aligned 1:1 with `chunks`.
 * On LLM failure (throw or missing generate()), that slot is '' — callers should
 * treat an empty string as "no prefix available, fall back to raw content".
 */
export async function generateChunkContexts(input: ChunkContextInput): Promise<string[]> {
  const { document, chunks, llm, signal } = input
  const maxTokens = input.maxContextTokens ?? 100
  const results: string[] = []

  if (!llm.generate) return chunks.map(() => '')

  const systemPrompt = SYSTEM_PROMPT(document)

  for (const chunk of chunks) {
    if (signal?.aborted) break
    try {
      const stream = llm.generate(USER_PROMPT(chunk), {
        systemPrompt,
        temperature: 0,
        maxTokens,
      })
      const text = await collectStream(stream)
      results.push(text.trim())
    } catch {
      results.push('')
    }
  }

  // Pad with empty strings if aborted early
  while (results.length < chunks.length) results.push('')
  return results
}
