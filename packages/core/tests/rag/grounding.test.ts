import { describe, it, expect } from 'vitest'
import { checkGrounding } from '../../src/rag/grounding.js'
import type { SearchResult } from '../../src/ingest/document-store.js'

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
