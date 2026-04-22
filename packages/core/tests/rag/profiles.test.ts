import { describe, it, expect } from 'vitest'
import { getProfileConfig } from '../../src/rag/profiles.js'

describe('RAG Profiles', () => {
  it('returns fast profile config with all advanced features off', () => {
    const config = getProfileConfig('fast')
    expect(config.retrieval.k).toBe(10)
    expect(config.retrieval.minScore).toBe(0.5)
    expect(config.retrieval.finalTopK).toBe(3)
    expect(config.features.reranker).toBe(false)
    expect(config.features.contextualRetrieval).toBe(false)
    expect(config.features.hyde).toBe(false)
    expect(config.features.multiQuery).toBe(false)
    expect(config.features.multiQueryN).toBe(0)
    expect(config.features.parentDocRetrieval).toBe(false)
    expect(config.features.crossEncoder).toBe(false)
    expect(config.features.chunkAugmentation).toBe(false)
  })

  it('returns balanced profile config with contextual + multi-query + parent-doc on', () => {
    const config = getProfileConfig('balanced')
    expect(config.retrieval.k).toBe(20)
    expect(config.retrieval.minScore).toBe(0.3)
    expect(config.retrieval.finalTopK).toBe(5)
    expect(config.features.reranker).toBe(true)
    expect(config.features.contextualRetrieval).toBe(true)
    expect(config.features.multiQuery).toBe(true)
    expect(config.features.multiQueryN).toBe(3)
    expect(config.features.parentDocRetrieval).toBe(true)
    // The expensive features stay OFF for balanced
    expect(config.features.hyde).toBe(false)
    expect(config.features.crossEncoder).toBe(false)
    expect(config.features.chunkAugmentation).toBe(false)
  })

  it('returns precise profile config with all advanced features on', () => {
    const config = getProfileConfig('precise')
    expect(config.retrieval.k).toBe(50)
    expect(config.retrieval.minScore).toBe(0.15)
    expect(config.retrieval.finalTopK).toBe(10)
    expect(config.features.reranker).toBe(true)
    expect(config.features.queryDecomposition).toBe(true)
    expect(config.features.contextualRetrieval).toBe(true)
    expect(config.features.hyde).toBe(true)
    expect(config.features.multiQuery).toBe(true)
    expect(config.features.multiQueryN).toBe(5)
    expect(config.features.parentDocRetrieval).toBe(true)
    expect(config.features.crossEncoder).toBe(true)
    expect(config.features.chunkAugmentation).toBe(true)
  })

  it('returns balanced base config for custom profile without overrides', () => {
    const config = getProfileConfig('custom')
    // Should default to balanced
    expect(config.retrieval.k).toBe(20)
    expect(config.retrieval.minScore).toBe(0.3)
    expect(config.retrieval.finalTopK).toBe(5)
    expect(config.features.reranker).toBe(true)
  })

  it('merges custom config overrides on top of balanced base', () => {
    const config = getProfileConfig('custom', {
      retrieval: { k: 30, minScore: 0.1, finalTopK: 8 },
    })
    expect(config.retrieval.k).toBe(30)
    expect(config.retrieval.minScore).toBe(0.1)
    expect(config.retrieval.finalTopK).toBe(8)
    // Non-overridden fields still come from balanced
    expect(config.features.reranker).toBe(true)
  })

  it('throws for unknown profile name', () => {
    expect(() => getProfileConfig('unknown-profile')).toThrow(/Unknown RAG profile/)
  })
})
