import type { ModelPlugin } from '../plugin/interfaces.js'

const MULTI_PROMPT = (q: string, n: number) => `Rewrite the following search query ${n} different ways. Each rewrite should preserve meaning but vary phrasing, terminology, and specificity. Include both casual and technical phrasings when applicable. One rewrite per line, numbered 1. through ${n}.

Original query: ${q}

Rewrites:`

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const piece of stream) out += piece
  return out
}

function parseRewrites(text: string): string[] {
  return text.split('\n')
    .map(l => l.replace(/^\s*(?:[-*•]|\d+[\.\)])\s*/, '').trim())
    .filter(l => l.length > 0)
}

/**
 * Expand a query into the original plus up to `n` LLM-generated paraphrases,
 * deduplicated case-insensitively. Returns `[query]` on LLM failure or missing
 * generate(). The retriever is expected to run each query in parallel and
 * RRF-merge the results.
 */
export async function expandMultiQuery(
  query: string,
  llm: ModelPlugin,
  n = 3
): Promise<string[]> {
  if (!llm.generate) return [query]
  try {
    const stream = llm.generate(MULTI_PROMPT(query, n), {
      temperature: 0.5,
      maxTokens: 256,
    })
    const text = await collectStream(stream)
    const rewrites = parseRewrites(text)

    const seen = new Set<string>([query.toLowerCase()])
    const out = [query]
    for (const rewrite of rewrites) {
      const key = rewrite.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(rewrite)
      if (out.length >= n + 1) break
    }
    return out
  } catch {
    return [query]
  }
}
