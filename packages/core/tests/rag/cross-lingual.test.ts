import { describe, it, expect } from 'vitest'
import { expandQuery, reciprocalRankFusion } from '../../src/rag/cross-lingual.js'

describe('Cross-Lingual', () => {
  it('expands Korean query with English terms', () => {
    const expanded = expandQuery('인증 설정 방법')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('authentication')
  })

  it('expands English query with Korean terms', () => {
    const expanded = expandQuery('How to configure authentication')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('인증')
  })

  it('does not expand when no matching terms', () => {
    const expanded = expandQuery('hello world')
    expect(expanded).toHaveLength(1)
  })

  it('RRF merges multiple result sets', () => {
    const set1 = [{ id: 'a', score: 0.9 }, { id: 'b', score: 0.8 }]
    const set2 = [{ id: 'b', score: 0.95 }, { id: 'c', score: 0.7 }]
    const merged = reciprocalRankFusion([set1, set2])
    // 'b' appears in both sets, should rank highest
    expect(merged[0].id).toBe('b')
    expect(merged.length).toBe(3)
  })
})

describe('Score-weighted RRF', () => {
  it('weights RRF by original score', () => {
    // 'a' ranks 2nd in both sets but has very high scores (0.95, 0.90)
    // 'b' ranks 1st in both sets but has low scores (0.10, 0.10)
    // score-weighted RRF should favour 'a' despite its lower rank
    const highScoreSet = [
      { id: 'b', score: 0.10, content: 'low' },
      { id: 'a', score: 0.95, content: 'high' },
    ]
    const otherSet = [
      { id: 'b', score: 0.10, content: 'low' },
      { id: 'a', score: 0.90, content: 'high' },
    ]

    const merged = reciprocalRankFusion(
      [highScoreSet, otherSet], 60,
      (item) => item.id,
      true // scoreWeighted
    )

    const aScore = merged.find(m => m.id === 'a')!.score
    const bScore = merged.find(m => m.id === 'b')!.score
    expect(aScore).toBeGreaterThan(bScore)
  })

  it('falls back to standard RRF when scoreWeighted is false', () => {
    const set1 = [
      { id: 'x', score: 0.99, content: 'x' },
      { id: 'y', score: 0.01, content: 'y' },
    ]
    const set2 = [
      { id: 'y', score: 0.99, content: 'y' },
      { id: 'x', score: 0.01, content: 'x' },
    ]

    const merged = reciprocalRankFusion([set1, set2], 60, (item) => item.id, false)
    const xScore = merged.find(m => m.id === 'x')!.score
    const yScore = merged.find(m => m.id === 'y')!.score
    expect(Math.abs(xScore - yScore)).toBeLessThan(0.001)
  })
})
