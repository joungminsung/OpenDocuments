import { describe, it, expect } from 'vitest'
import { calculateConfidence } from '../../src/rag/confidence.js'

describe('Confidence Scoring', () => {
  it('returns high confidence for strong results', () => {
    const result = calculateConfidence({
      retrievalScores: [0.9, 0.85, 0.8, 0.75, 0.7],
      rerankScores: [0.95, 0.9, 0.85, 0.8, 0.75],
      sourceCount: 5,
      queryKeywords: ['redis', 'config'],
      chunkTexts: ['redis config setup', 'redis configuration guide', 'configure redis cache', 'redis settings', 'redis config file'],
    })
    expect(result.level).toBe('high')
    expect(result.score).toBeGreaterThanOrEqual(0.7)
  })

  it('returns low confidence for weak results', () => {
    const result = calculateConfidence({
      retrievalScores: [0.5],
      rerankScores: [0.4],
      sourceCount: 1,
      queryKeywords: ['advanced', 'quantum', 'computing'],
      chunkTexts: ['basic introduction to databases'],
    })
    expect(result.level).toBe('low')
    expect(result.score).toBeGreaterThanOrEqual(0.2)
    expect(result.score).toBeLessThan(0.4)
  })

  it('returns none when no results', () => {
    const result = calculateConfidence({
      retrievalScores: [],
      rerankScores: [],
      sourceCount: 0,
      queryKeywords: ['test'],
      chunkTexts: [],
    })
    expect(result.level).toBe('none')
    expect(result.score).toBe(0)
  })
})
