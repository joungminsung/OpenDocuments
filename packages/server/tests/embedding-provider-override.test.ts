import { describe, it, expect } from 'vitest'
import { resolveEmbeddingProviderOverride } from '../src/bootstrap.js'

describe('resolveEmbeddingProviderOverride', () => {
  it('routes embeddings elsewhere when a different provider is configured', () => {
    // The regression: `ollama` can embed, so the override used to be dropped and
    // embeddings silently came from Ollama at a width the collection did not expect.
    expect(resolveEmbeddingProviderOverride('ollama', 'bge-m3')).toBe('bge-m3')
    expect(resolveEmbeddingProviderOverride('ollama', 'openai')).toBe('openai')
  })

  it('keeps embeddings on the main provider when none is configured', () => {
    expect(resolveEmbeddingProviderOverride('ollama', undefined)).toBeUndefined()
  })

  it('treats an override naming the main provider as no override', () => {
    expect(resolveEmbeddingProviderOverride('openai', 'openai')).toBeUndefined()
  })

  it('treats an empty override as unset', () => {
    expect(resolveEmbeddingProviderOverride('ollama', '')).toBeUndefined()
  })

  it('treats a whitespace-only override as unset', () => {
    // Reaches us untrimmed from config or the environment; left as-is it would be
    // taken for a provider name and fail plugin lookup.
    expect(resolveEmbeddingProviderOverride('ollama', '   ')).toBeUndefined()
    expect(resolveEmbeddingProviderOverride('ollama', '\t\n')).toBeUndefined()
  })

  it('trims a padded override rather than passing it through', () => {
    expect(resolveEmbeddingProviderOverride('ollama', '  openai  ')).toBe('openai')
    expect(resolveEmbeddingProviderOverride('ollama', '  ollama  ')).toBeUndefined()
  })

  it('still routes when the main provider cannot embed at all', () => {
    expect(resolveEmbeddingProviderOverride('anthropic', 'ollama')).toBe('ollama')
  })
})
