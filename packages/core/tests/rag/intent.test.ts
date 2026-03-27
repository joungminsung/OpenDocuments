import { describe, it, expect } from 'vitest'
import { classifyIntent } from '../../src/rag/intent.js'

describe('classifyIntent', () => {
  it('classifies code queries', () => {
    expect(classifyIntent('How to implement authentication?')).toBe('code')
    expect(classifyIntent('함수 어떻게 사용해?')).toBe('code')
    expect(classifyIntent('Show me code example for Redis')).toBe('code')
  })

  it('classifies concept queries', () => {
    expect(classifyIntent('What is microservice architecture?')).toBe('concept')
    expect(classifyIntent('마이크로서비스란 뭐야?')).toBe('concept')
  })

  it('classifies config queries', () => {
    expect(classifyIntent('How to configure Redis connection?')).toBe('config')
    expect(classifyIntent('환경변수 설정 방법')).toBe('config')
  })

  it('classifies data queries', () => {
    expect(classifyIntent('2024년 3분기 매출 현황')).toBe('data')
    expect(classifyIntent('How many documents are indexed?')).toBe('data')
  })

  it('classifies search queries', () => {
    expect(classifyIntent('Find documents about authentication')).toBe('search')
    expect(classifyIntent('최근 올라온 인사 관련 문서')).toBe('search')
  })

  it('classifies compare queries', () => {
    expect(classifyIntent('Compare REST vs GraphQL')).toBe('compare')
    expect(classifyIntent('v1과 v2 API 차이점')).toBe('compare')
  })

  it('returns general for ambiguous queries', () => {
    expect(classifyIntent('hello')).toBe('general')
    expect(classifyIntent('tell me about the project')).toBe('general')
  })
})
