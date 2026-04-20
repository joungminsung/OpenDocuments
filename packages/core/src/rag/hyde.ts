import type { ModelPlugin } from '../plugin/interfaces.js'

const HYDE_PROMPT = (q: string) => `Write a single-paragraph passage that would directly answer the following question. Write as if it were a factual extract from a reference document, not as a conversational reply. Do not use phrases like "the answer is" or "sure, here's...".

Question: ${q}

Passage:`

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const piece of stream) out += piece
  return out
}

/**
 * Generate a hypothetical passage that could answer the query. The passage is
 * intended to be embedded and merged with real retrieval results to bridge
 * query↔document vocabulary gaps. Returns '' on LLM failure or missing generate().
 */
export async function generateHypotheticalAnswer(
  query: string,
  llm: ModelPlugin
): Promise<string> {
  if (!llm.generate) return ''
  try {
    const stream = llm.generate(HYDE_PROMPT(query), {
      temperature: 0.3,
      maxTokens: 256,
    })
    const text = await collectStream(stream)
    return text.trim()
  } catch {
    return ''
  }
}
