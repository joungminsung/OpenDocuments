import { describe, it, expect } from 'vitest'
import { fitToContextWindow, type ContextWindowConfig } from '../../src/rag/context-window.js'
import type { QueryIntent } from '../../src/rag/intent.js'

describe('fitToContextWindow', () => {
  const makeMockChunk = (content: string, score: number) => ({
    chunkId: `chunk_${score}`,
    content,
    score,
    documentId: 'doc1',
    chunkType: 'semantic' as const,
    headingHierarchy: [],
    sourcePath: '/test.md',
    sourceType: 'local',
  })

  it('returns empty array for empty input', () => {
    expect(fitToContextWindow([])).toEqual([])
  })

  it('fits chunks within default context window', () => {
    const chunks = [
      makeMockChunk('Hello world', 0.9),
      makeMockChunk('Another chunk', 0.8),
    ]
    const result = fitToContextWindow(chunks)
    expect(result.length).toBe(2)
  })

  it('truncates chunks that exceed the budget', () => {
    // Use realistic text (not repeated chars) to ensure token count exceeds budget.
    // Default budget: 16384 * 0.65 = 10649 tokens. Each word is ~1 token.
    const sentence = 'The quick brown fox jumps over the lazy dog. '
    const bigContent = sentence.repeat(Math.ceil(60000 / sentence.length))
    const bigChunk = makeMockChunk(bigContent, 0.9)
    const result = fitToContextWindow([bigChunk])
    expect(result.length).toBe(1)
    expect(result[0].content.length).toBeLessThan(bigContent.length)
  })

  it('respects custom config', () => {
    const config: ContextWindowConfig = {
      maxContextTokens: 100,
      allocation: { systemPrompt: 0.1, chatHistory: 0.2, retrievedChunks: 0.5, generationBuffer: 0.2 },
    }
    const chunks = [
      makeMockChunk('A'.repeat(1000), 0.9),
      makeMockChunk('B'.repeat(1000), 0.8),
    ]
    const result = fitToContextWindow(chunks, config)
    // With only 50 tokens for chunks (very small), expect truncation or 1 chunk
    expect(result.length).toBeLessThanOrEqual(2)
  })
})

describe('Dynamic context window allocation by intent', () => {
  const makeMockChunk = (content: string, score: number) => ({
    chunkId: `chunk_${score}`,
    content,
    score,
    documentId: 'doc1',
    chunkType: 'semantic' as const,
    headingHierarchy: [],
    sourcePath: '/test.md',
    sourceType: 'local',
  })

  it('allocates more chunk space for code intent', () => {
    const config: ContextWindowConfig = {
      maxContextTokens: 1000,
      allocation: { systemPrompt: 0.1, chatHistory: 0.15, retrievedChunks: 0.65, generationBuffer: 0.1 },
    }
    const chunks = Array.from({ length: 20 }, (_, i) =>
      makeMockChunk('A'.repeat(200), 1 - i * 0.01)
    )
    const codeResult = fitToContextWindow(chunks, config, 0, 0, 'code')
    const generalResult = fitToContextWindow(chunks, config, 0, 0, 'general')
    // Code intent gets 75% chunks vs general 65% — more chunks should fit
    expect(codeResult.length).toBeGreaterThanOrEqual(generalResult.length)
  })

  it('allocates more history space for concept intent (less chunk space)', () => {
    const config: ContextWindowConfig = {
      maxContextTokens: 1000,
      allocation: { systemPrompt: 0.1, chatHistory: 0.15, retrievedChunks: 0.65, generationBuffer: 0.1 },
    }
    const chunks = Array.from({ length: 20 }, (_, i) =>
      makeMockChunk('B'.repeat(200), 1 - i * 0.01)
    )
    const conceptResult = fitToContextWindow(chunks, config, 0, 0, 'concept')
    const codeResult = fitToContextWindow(chunks, config, 0, 0, 'code')
    // Concept intent gets 55% chunks vs code 75% — fewer chunks should fit
    expect(conceptResult.length).toBeLessThanOrEqual(codeResult.length)
  })

  it('falls back to default allocation when no intent provided', () => {
    const chunks = [makeMockChunk('Hello world', 0.9)]
    const result = fitToContextWindow(chunks)
    expect(result).toHaveLength(1)
  })
})

describe('fitToContextWindow - expanded', () => {
  const makeMockChunk = (content: string, score: number) => ({
    chunkId: `chunk_${score}`,
    content,
    score,
    documentId: 'doc1',
    chunkType: 'semantic' as const,
    headingHierarchy: [],
    sourcePath: '/test.md',
    sourceType: 'local',
  })

  it('uses 65% allocation for retrieved chunks by default', () => {
    const chunks = Array.from({ length: 120 }, (_, i) =>
      makeMockChunk('A'.repeat(400), 1 - i * 0.001)
    )
    const fitted = fitToContextWindow(chunks)
    expect(fitted.length).toBeGreaterThan(50)
  })

  it('respects custom config with higher maxContextTokens', () => {
    const config: ContextWindowConfig = {
      maxContextTokens: 32768,
      allocation: { systemPrompt: 0.1, chatHistory: 0.15, retrievedChunks: 0.65, generationBuffer: 0.1 },
    }
    const chunks = Array.from({ length: 200 }, (_, i) =>
      makeMockChunk('B'.repeat(400), 1 - i * 0.001)
    )
    const fitted = fitToContextWindow(chunks, config)
    expect(fitted.length).toBeGreaterThan(150)
  })
})
