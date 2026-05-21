import type { RAGEngine, QueryResult } from './engine.js'

/**
 * Hit@K: 1 if ANY relevant doc id appears in the first K retrieved ids, else 0.
 */
export function hitAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  return retrieved.slice(0, k).some(id => relevant.has(id)) ? 1 : 0
}

/**
 * Reciprocal rank of the first relevant doc id (1 / rank). 0 if none retrieved.
 */
export function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1)
  }
  return 0
}

/**
 * nDCG@K with binary relevance (1 if relevant, 0 otherwise).
 * Ideal DCG assumes all relevant items packed at the top.
 */
export function nDCG(retrieved: string[], relevant: Set<string>, k: number): number {
  let dcg = 0
  for (let i = 0; i < Math.min(k, retrieved.length); i++) {
    if (relevant.has(retrieved[i])) dcg += 1 / Math.log2(i + 2)
  }
  const ideal = Array.from({ length: Math.min(k, relevant.size) }, (_, i) => 1 / Math.log2(i + 2))
    .reduce((a, b) => a + b, 0)
  return ideal === 0 ? 0 : dcg / ideal
}

export interface GoldCase {
  id: string
  query: string
  relevantDocumentIds: string[]
  intent?: string
}

export interface EvalSummary {
  totalCases: number
  hitAt3: number
  hitAt5: number
  mrr: number
  nDCGAt5: number
  byIntent: Record<string, { count: number; hitAt5: number; mrr: number }>
}

/**
 * Run `engine.query()` across each case, compute per-case metrics, and aggregate
 * into an EvalSummary. Document ids retrieved are deduplicated (per-case) before
 * scoring so that multiple chunks from the same doc don't inflate hit counts.
 */
export async function evaluate(
  engine: RAGEngine,
  cases: GoldCase[]
): Promise<EvalSummary> {
  const perCase = await Promise.all(cases.map(async c => {
    const res: QueryResult = await engine.query({ query: c.query })
    const retrievedDocIds = Array.from(new Set(res.sources.map(s => s.documentId)))
    const relevant = new Set(c.relevantDocumentIds)
    return {
      case: c,
      hit3: hitAtK(retrievedDocIds, relevant, 3),
      hit5: hitAtK(retrievedDocIds, relevant, 5),
      rr: reciprocalRank(retrievedDocIds, relevant),
      ndcg: nDCG(retrievedDocIds, relevant, 5),
    }
  }))

  const avg = (xs: number[]) => xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
  const byIntent: EvalSummary['byIntent'] = {}
  for (const r of perCase) {
    const intent = r.case.intent ?? 'general'
    byIntent[intent] ??= { count: 0, hitAt5: 0, mrr: 0 }
    byIntent[intent].count++
    byIntent[intent].hitAt5 += r.hit5
    byIntent[intent].mrr += r.rr
  }
  for (const i of Object.keys(byIntent)) {
    byIntent[i].hitAt5 /= byIntent[i].count
    byIntent[i].mrr  /= byIntent[i].count
  }

  return {
    totalCases: perCase.length,
    hitAt3: avg(perCase.map(r => r.hit3)),
    hitAt5: avg(perCase.map(r => r.hit5)),
    mrr:    avg(perCase.map(r => r.rr)),
    nDCGAt5:avg(perCase.map(r => r.ndcg)),
    byIntent,
  }
}
