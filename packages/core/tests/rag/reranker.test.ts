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

  it('matches exact words with word-boundary matching', async () => {
    const results = [
      makeResult('Set the auth config in the environment file', 0.5),
      makeResult('Unrelated content about food recipes and cooking', 0.5),
    ]
    const reranked = await rerankResults('auth config', results)
    expect(reranked[0].content).toContain('auth config')
  })

  it('handles Korean query with word matching', async () => {
    const results = [
      makeResult('인증 토큰을 설정하는 방법입니다', 0.5),
      makeResult('요리 레시피 모음집입니다', 0.5),
    ]
    const reranked = await rerankResults('인증 설정', results)
    expect(reranked[0].content).toContain('인증')
  })
})

describe('N-gram phrase matching', () => {
  it('does not match "auth" with "author"', async () => {
    const results = [
      makeResult('The author of this book is famous', 0.5),
      makeResult('Authentication requires a valid token', 0.5),
    ]
    const reranked = await rerankResults('auth token', results)
    expect(reranked[0].content).toContain('Authentication')
  })

  it('does not match "log" with "login" when querying for logs', async () => {
    const results = [
      makeResult('Login page requires username and password', 0.5),
      makeResult('Check the application log files for errors', 0.5),
    ]
    const reranked = await rerankResults('log files', results)
    expect(reranked[0].content).toContain('log files')
  })

  it('matches exact word boundaries', async () => {
    const results = [
      makeResult('Use the config file to set options', 0.5),
      makeResult('Reconfiguring the network adapter', 0.5),
    ]
    const reranked = await rerankResults('config file', results)
    expect(reranked[0].content).toContain('config file')
  })

  it('matches n-gram phrases for multi-word queries', async () => {
    const results = [
      makeResult('Redis is used for cache storage and session management', 0.5),
      makeResult('The cache configuration requires redis connection string', 0.5),
    ]
    const reranked = await rerankResults('redis cache configuration', results)
    expect(reranked[0].content).toContain('cache configuration')
  })
})

describe('Intent-adaptive reranking', () => {
  it('boosts code-type chunks for code intent queries', async () => {
    const results = [
      makeResult('Authentication uses JWT tokens for security', 0.5, { chunkType: 'semantic' }),
      makeResult('function authenticate(token: string) { return verify(token) }', 0.5, { chunkType: 'code-ast' }),
    ]
    const reranked = await rerankResults('how to implement authentication', results, undefined, 'code')
    expect(reranked[0].chunkType).toBe('code-ast')
  })

  it('boosts semantic chunks for concept intent queries', async () => {
    const results = [
      makeResult('function setupRedis() { ... }', 0.6, { chunkType: 'code-ast' }),
      makeResult('Redis is an in-memory data structure store used as a database, cache, and message broker', 0.5, { chunkType: 'semantic' }),
    ]
    const reranked = await rerankResults('What is Redis?', results, undefined, 'concept')
    expect(reranked[0].chunkType).toBe('semantic')
  })

  it('uses default weights when no intent provided', async () => {
    const results = [
      makeResult('Redis configuration guide', 0.8),
      makeResult('Python tutorial basics', 0.75),
    ]
    const reranked = await rerankResults('Redis', results)
    expect(reranked).toHaveLength(2)
  })
})
