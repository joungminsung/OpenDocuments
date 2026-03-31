import { describe, it, expect } from 'vitest'
import { rerankResults } from '../../src/rag/reranker.js'
import type { SearchResult } from '../../src/ingest/document-store.js'

const mockResults: SearchResult[] = [
  { chunkId: '1', content: 'Python tutorial for beginners', score: 0.8, documentId: 'd1', chunkType: 'semantic', headingHierarchy: [], sourcePath: '/a.md', sourceType: 'local' },
  { chunkId: '2', content: 'Redis configuration and setup guide', score: 0.75, documentId: 'd2', chunkType: 'semantic', headingHierarchy: [], sourcePath: '/b.md', sourceType: 'local' },
  { chunkId: '3', content: 'Database configuration for production', score: 0.7, documentId: 'd3', chunkType: 'semantic', headingHierarchy: [], sourcePath: '/c.md', sourceType: 'local' },
]

describe('rerankResults', () => {
  it('reranks by keyword overlap', async () => {
    const reranked = await rerankResults('Redis configuration', mockResults)
    expect(reranked[0].content).toContain('Redis')
  })

  it('returns single result unchanged', async () => {
    const single = [mockResults[0]]
    const result = await rerankResults('test', single)
    expect(result).toEqual(single)
  })

  it('returns empty array for empty input', async () => {
    const result = await rerankResults('test', [])
    expect(result).toEqual([])
  })

  it('preserves all results', async () => {
    const reranked = await rerankResults('database', mockResults)
    expect(reranked).toHaveLength(3)
  })
})

const makeResult = (content: string, score: number, extra?: Partial<SearchResult>): SearchResult => ({
  chunkId: `chunk_${Math.random()}`,
  content,
  score,
  documentId: 'doc1',
  chunkType: 'semantic',
  headingHierarchy: [],
  sourcePath: '/test.md',
  sourceType: 'local',
  ...extra,
})

describe('Improved reranker fallback', () => {
  it('boosts results where query words appear in headings', async () => {
    const results = [
      makeResult('Some generic content about servers', 0.5, { headingHierarchy: ['Authentication Guide'] }),
      makeResult('Some generic content about servers', 0.5, { headingHierarchy: ['Deployment Guide'] }),
    ]
    const reranked = await rerankResults('authentication setup', results)
    expect(reranked[0].headingHierarchy).toContain('Authentication Guide')
  })

  it('matches partial/substring keywords (prefix matching)', async () => {
    const results = [
      makeResult('Configure authentication tokens for the service', 0.5),
      makeResult('Unrelated content about food recipes and cooking', 0.5),
    ]
    const reranked = await rerankResults('auth config', results)
    expect(reranked[0].content).toContain('authentication')
  })

  it('handles Korean query with partial matching', async () => {
    const results = [
      makeResult('인증 토큰을 설정하는 방법입니다', 0.5),
      makeResult('요리 레시피 모음집입니다', 0.5),
    ]
    const reranked = await rerankResults('인증 설정', results)
    expect(reranked[0].content).toContain('인증')
  })
})
