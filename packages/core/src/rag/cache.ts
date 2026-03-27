interface CacheEntry<T> {
  value: T
  expiresAt: number
}

/**
 * Simple in-memory cache with TTL support.
 * Used for L1 (query cache) and can be extended for L2/L3.
 */
export class RAGCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>()
  private maxSize: number
  private ttlMs: number

  constructor(opts: { maxSize?: number; ttlMs: number }) {
    this.maxSize = opts.maxSize || 1000
    this.ttlMs = opts.ttlMs
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value
      if (firstKey) this.store.delete(firstKey)
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    // Clean expired entries first
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key)
    }
    return this.store.size
  }
}

// Pre-configured caches matching spec
export function createQueryCache() {
  return new RAGCache({ ttlMs: 5 * 60 * 1000, maxSize: 500 }) // L1: 5 min
}

export function createEmbeddingCache() {
  return new RAGCache<number[]>({ ttlMs: 24 * 60 * 60 * 1000, maxSize: 10000 }) // L2: 24h
}

export function createWebSearchCache() {
  return new RAGCache({ ttlMs: 60 * 60 * 1000, maxSize: 200 }) // L3: 1h
}
