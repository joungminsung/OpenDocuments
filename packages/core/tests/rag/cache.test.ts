import { describe, it, expect, vi } from 'vitest'
import { RAGCache } from '../../src/rag/cache.js'

describe('RAGCache', () => {
  it('stores and retrieves values', () => {
    const cache = new RAGCache({ ttlMs: 60000 })
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')
  })

  it('returns undefined for missing keys', () => {
    const cache = new RAGCache({ ttlMs: 60000 })
    expect(cache.get('missing')).toBeUndefined()
  })

  it('expires entries after TTL', () => {
    vi.useFakeTimers()
    const cache = new RAGCache({ ttlMs: 1000 })
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')

    vi.advanceTimersByTime(1500)
    expect(cache.get('key1')).toBeUndefined()
    vi.useRealTimers()
  })

  it('evicts oldest when at capacity', () => {
    const cache = new RAGCache({ ttlMs: 60000, maxSize: 2 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)  // should evict 'a'
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('c')).toBe(3)
  })

  it('clears all entries', () => {
    const cache = new RAGCache({ ttlMs: 60000 })
    cache.set('a', 1)
    cache.set('b', 2)
    cache.clear()
    expect(cache.size).toBe(0)
  })
})
