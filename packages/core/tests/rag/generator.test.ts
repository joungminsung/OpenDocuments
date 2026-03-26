import { describe, it, expect } from 'vitest'
import { buildPrompt } from '../../src/rag/generator.js'
import type { SearchResult } from '../../src/ingest/document-store.js'

describe('buildPrompt', () => {
  it('includes context and query in prompt', () => {
    const context: SearchResult[] = [
      {
        chunkId: '1',
        content: 'Redis config guide',
        score: 0.9,
        documentId: 'd1',
        chunkType: 'semantic',
        headingHierarchy: ['# Redis'],
        sourcePath: '/docs/redis.md',
        sourceType: 'local',
      },
    ]
    const prompt = buildPrompt({
      query: 'How to setup Redis?',
      context,
      intent: 'general',
    })
    expect(prompt).toContain('How to setup Redis?')
    expect(prompt).toContain('Redis config guide')
    expect(prompt).toContain('/docs/redis.md')
  })

  it('uses intent-specific prompt for code queries', () => {
    const prompt = buildPrompt({
      query: 'Show me the function',
      context: [],
      intent: 'code',
    })
    expect(prompt).toContain('code')
  })

  it('falls back to general prompt for unknown intent', () => {
    const prompt = buildPrompt({
      query: 'test',
      context: [],
      intent: 'unknown_intent',
    })
    expect(prompt).toContain('documentation assistant')
  })
})
