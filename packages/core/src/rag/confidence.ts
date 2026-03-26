export interface ConfidenceInput {
  retrievalScores: number[]
  rerankScores: number[]
  sourceCount: number
  queryKeywords: string[]
  chunkTexts: string[]
}

export interface ConfidenceResult {
  score: number
  level: 'high' | 'medium' | 'low' | 'none'
  reason: string
}

const WEIGHTS = { retrievalScore: 0.4, rerankScore: 0.3, sourceCount: 0.15, chunkCoverage: 0.15 }

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  if (input.retrievalScores.length === 0) {
    return { score: 0, level: 'none', reason: 'No relevant documents found' }
  }
  const avgRetrieval = average(input.retrievalScores)
  const avgRerank = input.rerankScores.length > 0 ? average(input.rerankScores) : avgRetrieval
  const sourceFactor = Math.min(input.sourceCount / 5, 1.0)
  const coverage = input.queryKeywords.length > 0
    ? input.queryKeywords.filter(kw => input.chunkTexts.some(t => t.toLowerCase().includes(kw.toLowerCase()))).length / input.queryKeywords.length
    : 0

  const score = avgRetrieval * WEIGHTS.retrievalScore + avgRerank * WEIGHTS.rerankScore + sourceFactor * WEIGHTS.sourceCount + coverage * WEIGHTS.chunkCoverage

  const level: ConfidenceResult['level'] =
    score >= 0.7 ? 'high' :
    score >= 0.4 ? 'medium' :
    score >= 0.2 ? 'low' : 'none'
  const reason = level === 'high' ? 'Strong match with multiple supporting sources' : level === 'medium' ? 'Partial match found' : level === 'low' ? 'Weak match -- results may not be accurate' : 'No relevant documents found'

  return { score, level, reason }
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}
