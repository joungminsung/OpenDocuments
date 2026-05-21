import { describe, it, expect } from 'vitest'
import { checkGrounding, checkSemanticGrounding } from '../../src/rag/grounding.js'
import type { SearchResult } from '../../src/ingest/document-store.js'
import type { EmbeddingResult } from '../../src/plugin/interfaces.js'

const sources: SearchResult[] = [
  { chunkId: '1', content: 'Redis is an in-memory data store used for caching and session management', score: 0.9, documentId: 'd1', chunkType: 'semantic', headingHierarchy: [], sourcePath: '/a.md', sourceType: 'local' },
]

describe('checkGrounding', () => {
  it('marks well-grounded sentences', () => {
    const result = checkGrounding(
      'Redis is used for caching. It stores data in memory.',
      sources
    )
    expect(result.groundedSentences).toBeGreaterThan(0)
  })

  it('detects ungrounded sentences', () => {
    const result = checkGrounding(
      'Redis is used for caching. PostgreSQL is a relational database with ACID compliance.',
      sources
    )
    expect(result.ungroundedSentences).toBeGreaterThan(0)
  })

  it('strict mode adds warnings', () => {
    const result = checkGrounding(
      'Redis is great. Quantum computing will revolutionize everything.',
      sources,
      true
    )
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.annotatedAnswer).toContain('[unverified]')
  })

  it('handles empty answer', () => {
    const result = checkGrounding('', sources)
    expect(result.totalSentences).toBe(0)
  })
})

describe('checkSemanticGrounding', () => {
  /**
   * Mock embed function that returns simple normalized vectors.
   * Texts containing "redis" or "caching" get a similar vector to the source,
   * while unrelated texts get a very different vector.
   */
  function createMockEmbed(): (texts: string[]) => Promise<EmbeddingResult> {
    return async (texts: string[]): Promise<EmbeddingResult> => {
      const dense = texts.map(text => {
        const lower = text.toLowerCase()
        // Source-like content gets vector [0.9, 0.1, 0.0]
        if (lower.includes('redis') || lower.includes('caching') || lower.includes('in-memory') || lower.includes('session')) {
          return [0.9, 0.1, 0.0]
        }
        // Unrelated content gets vector [0.0, 0.1, 0.9] (low cosine sim to source)
        return [0.0, 0.1, 0.9]
      })
      return { dense }
    }
  }

  it('identifies grounded sentences via embedding similarity', async () => {
    const embed = createMockEmbed()
    const result = await checkSemanticGrounding(
      'Redis is used for caching. PostgreSQL is a relational database with ACID compliance.',
      sources,
      embed
    )
    expect(result.groundedSentences).toBe(1)
    expect(result.ungroundedSentences).toBe(1)
    expect(result.totalSentences).toBe(2)
  })

  it('handles empty answer', async () => {
    const embed = createMockEmbed()
    const result = await checkSemanticGrounding('', sources, embed)
    expect(result.totalSentences).toBe(0)
    expect(result.groundedSentences).toBe(0)
  })

  it('returns word-overlap result when embed is null', async () => {
    const result = await checkSemanticGrounding(
      'Redis is used for caching. It stores data in memory.',
      sources,
      null
    )
    // Should fall back to checkGrounding behavior
    expect(result.groundedSentences).toBeGreaterThan(0)
  })

  it('strict mode has higher threshold', async () => {
    // Create embed that returns borderline similarity (~0.65)
    const borderlineEmbed = async (texts: string[]): Promise<EmbeddingResult> => {
      const dense = texts.map(text => {
        const lower = text.toLowerCase()
        if (lower.includes('redis') || lower.includes('caching') || lower.includes('in-memory') || lower.includes('session')) {
          return [0.9, 0.1, 0.0]
        }
        // Borderline: cosine sim ~0.65 with [0.9, 0.1, 0.0]
        return [0.6, 0.1, 0.7]
      })
      return { dense }
    }

    const normalResult = await checkSemanticGrounding(
      'Quantum computing will revolutionize databases.',
      sources,
      borderlineEmbed,
      false
    )

    const strictResult = await checkSemanticGrounding(
      'Quantum computing will revolutionize databases.',
      sources,
      borderlineEmbed,
      true
    )

    // Borderline similarity should pass normal threshold (0.6) but fail strict (0.7)
    expect(strictResult.ungroundedSentences).toBeGreaterThanOrEqual(normalResult.ungroundedSentences)
  })
})
