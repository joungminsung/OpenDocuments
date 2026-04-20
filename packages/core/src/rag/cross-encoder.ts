import type { ModelPlugin } from '../plugin/interfaces.js'
import type { SearchResult } from '../ingest/document-store.js'

const SCORE_PROMPT = (q: string, passage: string) => `Rate how well the passage answers the query. Respond with a single integer from 0 to 10 and no other text.

Query: ${q}
Passage: ${passage}

Score:`

async function collectStream(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const piece of stream) out += piece
  return out
}

function parseScore(text: string): number {
  const m = (text || '').match(/-?\d+/)
  if (!m) return 0
  const n = parseInt(m[0], 10)
  return Math.max(0, Math.min(10, n))
}

/**
 * Pairwise LLM rerank of the top-K candidates. Runs 1 LLM call per head candidate.
 * The tail (results.slice(topK)) is passed through in its original order and scores.
 * On LLM failure during the head batch, the original input order is returned unchanged.
 *
 * Time cost scales linearly with topK; default 10 is a reasonable tradeoff.
 */
export async function crossEncoderRerank(
  query: string,
  results: SearchResult[],
  llm: ModelPlugin,
  topK: number,
): Promise<SearchResult[]> {
  if (results.length === 0) return []
  if (!llm.generate) return results

  const effectiveTopK = Math.min(topK, results.length)
  const head = results.slice(0, effectiveTopK)
  const tail = results.slice(effectiveTopK)

  try {
    const scores = await Promise.all(
      head.map(async r => {
        const stream = llm.generate!(SCORE_PROMPT(query, r.content), {
          temperature: 0,
          maxTokens: 8,
        })
        const text = await collectStream(stream)
        return parseScore(text)
      }),
    )
    const reranked = head
      .map((r, i) => ({ ...r, score: scores[i] / 10 }))
      .sort((a, b) => b.score - a.score)
    return [...reranked, ...tail]
  } catch {
    return results
  }
}
