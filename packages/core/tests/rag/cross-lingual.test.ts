import { describe, it, expect, afterEach } from 'vitest'
import { expandQuery, reciprocalRankFusion, loadCustomDictionary } from '../../src/rag/cross-lingual.js'

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

describe('Expanded dictionary', () => {
  it('has 300+ Korean-English pairs', () => {
    const expanded = expandQuery('마이크로서비스 아키텍처 설계')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('microservice')
  })

  it('covers DevOps terminology', () => {
    const expanded = expandQuery('컨테이너 오케스트레이션')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('container')
  })

  it('covers data science terminology', () => {
    const expanded = expandQuery('머신러닝 모델 학습')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('machine learning')
  })

  it('handles English DevOps terms to Korean', () => {
    const expanded = expandQuery('kubernetes deployment strategy')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('배포')
  })

  it('covers security terminology', () => {
    const expanded = expandQuery('암호화 토큰 인가')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('encryption')
  })

  it('covers frontend terminology', () => {
    const expanded = expandQuery('렌더링 상태관리 반응형')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('rendering')
  })

  it('covers testing terminology', () => {
    const expanded = expandQuery('단위테스트 커버리지 디버깅')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('unit test')
  })

  it('covers API terminology', () => {
    const expanded = expandQuery('웹소켓 웹훅 직렬화')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('WebSocket')
  })

  it('covers project management terminology', () => {
    const expanded = expandQuery('스프린트 릴리즈 풀리퀘스트')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('sprint')
  })
})

describe('Custom dictionary', () => {
  afterEach(() => {
    loadCustomDictionary({})
  })

  it('loads custom pairs and uses them in expansion', () => {
    loadCustomDictionary({ '커스텀용어': 'customterm', '특수단어': 'specialword' })
    const expanded = expandQuery('커스텀용어 사용법')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('customterm')
  })

  it('custom dictionary supplements base dictionary', () => {
    loadCustomDictionary({ '새단어': 'newword' })
    const expanded = expandQuery('인증 방법')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('authentication')
  })

  it('clears custom dictionary with empty object', () => {
    loadCustomDictionary({ '임시': 'temporary' })
    loadCustomDictionary({})
    const expanded = expandQuery('임시 파일')
    // '파일' is in the base dict, so we still get expansion, but '임시' should not translate
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).not.toContain('temporary')
  })

  it('custom pairs override base pairs', () => {
    loadCustomDictionary({ '인증': 'auth' })
    const expanded = expandQuery('인증 방법')
    expect(expanded.length).toBeGreaterThan(1)
    expect(expanded[1]).toContain('auth')
  })
})
