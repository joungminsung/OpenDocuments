import { describe, it, expect } from 'vitest'
import { attachParentContext } from '../../src/rag/parent-doc.js'
import type { SearchResult } from '../../src/ingest/document-store.js'

const mk = (id: string, content: string, parent?: string, score = 0.9, docId = 'doc1'): SearchResult => ({
  chunkId: id, content, score,
  documentId: docId, chunkType: 'semantic', headingHierarchy: [],
  sourcePath: '/x', sourceType: 'local',
  parentSection: parent,
})

describe('attachParentContext', () => {
  it('replaces content with parentSection when the parent is longer', () => {
    const r = mk('c1', 'short', 'Full parent section text covering the topic in detail.')
    const out = attachParentContext([r])
    expect(out[0].content).toBe('Full parent section text covering the topic in detail.')
  })

  it('keeps content unchanged when parentSection is missing', () => {
    const r = mk('c1', 'just the chunk')
    const out = attachParentContext([r])
    expect(out[0].content).toBe('just the chunk')
  })

  it('keeps content unchanged when parentSection is shorter than the chunk (degenerate)', () => {
    const r = mk('c1', 'this is a long chunk body', 'short')
    const out = attachParentContext([r])
    expect(out[0].content).toBe('this is a long chunk body')
  })

  it('deduplicates when multiple chunks map to the same parent (same document)', () => {
    const parent = 'Shared parent section containing both small chunks and a lot more context.'
    const out = attachParentContext([
      mk('c1', 'small a', parent, 0.9),
      mk('c2', 'small b', parent, 0.5),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].content).toBe(parent)
    // Highest score from the collapsed group is preserved
    expect(out[0].score).toBe(0.9)
  })

  it('does NOT collapse same parentSection text from different documents', () => {
    const parent = 'Copy-pasted paragraph that happens to appear in two docs.'
    const out = attachParentContext([
      mk('a', 'x', parent, 0.8, 'docA'),
      mk('b', 'y', parent, 0.6, 'docB'),
    ])
    expect(out).toHaveLength(2)
  })

  it('returns results sorted by score desc after dedupe', () => {
    const out = attachParentContext([
      mk('c1', 'a', 'parent one, long enough to win',  0.3),
      mk('c2', 'b', 'parent two, also long enough',    0.8),
      mk('c3', 'c', 'parent three, the lowest scorer', 0.1),
    ])
    expect(out.map(r => r.score)).toEqual([0.8, 0.3, 0.1])
  })
})
