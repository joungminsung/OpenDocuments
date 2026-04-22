import { describe, it, expect } from 'vitest'
import { estimateTokens } from '../../src/utils/tokenizer.js'

describe('estimateTokens', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('counts tokens for English text', () => {
    const text = 'Hello, world! This is a simple English sentence.'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
    // tiktoken should produce a precise count; rough sanity check
    expect(tokens).toBeGreaterThanOrEqual(8)
    expect(tokens).toBeLessThanOrEqual(15)
  })

  it('counts tokens for Korean text', () => {
    const text = '안녕하세요. 이것은 한국어 문장입니다.'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
    // Korean text typically uses more tokens than character count suggests
    expect(tokens).toBeGreaterThanOrEqual(5)
    expect(tokens).toBeLessThanOrEqual(30)
  })

  it('counts tokens for mixed CJK and English text', () => {
    const text = 'OpenDocuments는 자체 호스팅 RAG 플랫폼이다.'
    const tokens = estimateTokens(text)
    expect(tokens).toBeGreaterThan(0)
    expect(tokens).toBeGreaterThanOrEqual(5)
    expect(tokens).toBeLessThanOrEqual(25)
  })

  it('counts tokens for Chinese and Japanese text', () => {
    const chinese = '这是一个中文句子。'
    const japanese = 'これは日本語の文です。'
    const chTokens = estimateTokens(chinese)
    const jpTokens = estimateTokens(japanese)
    expect(chTokens).toBeGreaterThan(0)
    expect(jpTokens).toBeGreaterThan(0)
  })

  it('counts tokens for code snippets', () => {
    const code = `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`
    const tokens = estimateTokens(code)
    expect(tokens).toBeGreaterThan(0)
    // Code has many small tokens (braces, parens, operators)
    expect(tokens).toBeGreaterThanOrEqual(20)
    expect(tokens).toBeLessThanOrEqual(60)
  })

  it('handles whitespace-only strings', () => {
    const tokens = estimateTokens('   \n\t  ')
    expect(tokens).toBeGreaterThanOrEqual(0)
  })

  it('handles very long text without crashing', () => {
    const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(1000)
    const tokens = estimateTokens(longText)
    expect(tokens).toBeGreaterThan(1000)
  })

  it('returns consistent results for the same input', () => {
    const text = 'Consistency test with some tokens.'
    const first = estimateTokens(text)
    const second = estimateTokens(text)
    expect(first).toBe(second)
  })
})
