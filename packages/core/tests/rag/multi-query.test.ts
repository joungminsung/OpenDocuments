import { describe, it, expect, vi } from 'vitest'
import { expandMultiQuery } from '../../src/rag/multi-query.js'

function fakeLLM(output: string) {
  return {
    name: 'mock', type: 'model' as const, version: '0', coreVersion: '^0',
    capabilities: { llm: true },
    generate: vi.fn(async function*(): AsyncIterable<string> { yield output }),
    setup: async () => {}, healthCheck: async () => ({ healthy: true }),
  } as any
}

describe('expandMultiQuery', () => {
  it('produces original + N paraphrases from the LLM', async () => {
    const llm = fakeLLM('1. What is the Redis cache configuration?\n2. How do I configure caching in Redis?\n3. Redis caching setup guide')
    const queries = await expandMultiQuery('Redis 캐시 설정', llm, 3)
    expect(queries[0]).toBe('Redis 캐시 설정')
    expect(queries).toHaveLength(4)
    expect(queries[1]).toMatch(/Redis/)
  })

  it('returns just the original on LLM failure', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> { throw new Error('oops') }),
    }
    const queries = await expandMultiQuery('test', llm, 3)
    expect(queries).toEqual(['test'])
  })

  it('returns just the original when the model cannot generate', async () => {
    const llm: any = { capabilities: { embedding: true } }
    const queries = await expandMultiQuery('test', llm, 3)
    expect(queries).toEqual(['test'])
  })

  it('deduplicates case-insensitively and drops the original from rewrites if repeated', async () => {
    const llm = fakeLLM('1. same\n2. same\n3. SAME\n4. different one')
    const queries = await expandMultiQuery('same', llm, 4)
    // 'same' already in list (the original), so no additional 'same'/'SAME' slots
    expect(queries[0]).toBe('same')
    // Only 'different one' should survive as a unique rewrite
    expect(queries).toEqual(['same', 'different one'])
  })

  it('accepts numbered, bulleted, and plain lines', async () => {
    const llm = fakeLLM('- first variant\n* second variant\n3) third variant\n  fourth variant')
    const queries = await expandMultiQuery('orig', llm, 5)
    expect(queries).toEqual(['orig', 'first variant', 'second variant', 'third variant', 'fourth variant'])
  })

  it('skips empty lines', async () => {
    const llm = fakeLLM('1. a\n\n2. b\n\n')
    const queries = await expandMultiQuery('q', llm, 2)
    expect(queries).toEqual(['q', 'a', 'b'])
  })

  it('truncates to n paraphrases plus the original when LLM over-produces', async () => {
    const llm = fakeLLM('1. a\n2. b\n3. c\n4. d\n5. e')
    const queries = await expandMultiQuery('q', llm, 2)
    // Original + at most 2 paraphrases
    expect(queries).toEqual(['q', 'a', 'b'])
  })
})
