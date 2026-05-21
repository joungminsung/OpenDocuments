import { describe, it, expect, vi } from 'vitest'
import { generateChunkContexts } from '../../src/rag/contextual.js'

// Helper to build a fake ModelPlugin whose generate() streams a list of pre-canned responses.
function fakeLLM(responses: string[]) {
  const calls: Array<{ prompt: string; opts: any }> = []
  const gen = vi.fn(async function*(prompt: string, opts?: any): AsyncIterable<string> {
    calls.push({ prompt, opts })
    const text = responses.shift() ?? ''
    yield text
  })
  return {
    name: 'mock-llm', type: 'model' as const, version: '0', coreVersion: '^0',
    capabilities: { llm: true },
    generate: gen,
    setup: async () => {}, healthCheck: async () => ({ healthy: true }),
    _calls: calls,
  } as any
}

describe('generateChunkContexts', () => {
  it('produces one context string per chunk', async () => {
    const llm = fakeLLM(['Redis caching section.', 'Redis TTL configuration.'])
    const contexts = await generateChunkContexts({
      document: '# Redis\n\n## Caching\n\nBody\n\n## TTL\n\nBody',
      chunks: ['caching chunk body', 'ttl chunk body'],
      llm,
    })
    expect(contexts).toHaveLength(2)
    expect(contexts[0]).toContain('Redis')
    expect(contexts[1]).toContain('TTL')
  })

  it('returns empty strings when the LLM throws', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> {
        throw new Error('rate limit')
      }),
    }
    const contexts = await generateChunkContexts({
      document: 'doc', chunks: ['a', 'b', 'c'], llm,
    })
    expect(contexts).toEqual(['', '', ''])
  })

  it('returns empty strings when the model does not expose generate()', async () => {
    const llm: any = { capabilities: { embedding: true } }
    const contexts = await generateChunkContexts({
      document: 'doc', chunks: ['a', 'b'], llm,
    })
    expect(contexts).toEqual(['', ''])
  })

  it('puts the shared document in systemPrompt so adapters can cache it', async () => {
    const llm = fakeLLM(['c1', 'c2'])
    await generateChunkContexts({
      document: 'A'.repeat(5000),
      chunks: ['x', 'y'],
      llm,
    })
    expect((llm as any)._calls).toHaveLength(2)
    for (const call of (llm as any)._calls) {
      expect(call.opts?.systemPrompt).toBeDefined()
      expect(call.opts.systemPrompt.length).toBeGreaterThanOrEqual(5000)
    }
  })

  it('trims whitespace from generated contexts', async () => {
    const llm = fakeLLM(['  leading and trailing  \n'])
    const [c] = await generateChunkContexts({
      document: 'doc', chunks: ['x'], llm,
    })
    expect(c).toBe('leading and trailing')
  })

  it('stops early when AbortSignal fires, padding the rest with empty strings', async () => {
    const controller = new AbortController()
    const llm: any = fakeLLM(['first', 'second', 'third', 'fourth'])
    // Fire abort after the first response
    const origGen = llm.generate
    llm.generate = vi.fn(async function*(p: string, o: any): AsyncIterable<string> {
      yield* origGen(p, o)
      controller.abort()
    })
    const contexts = await generateChunkContexts({
      document: 'doc',
      chunks: ['a', 'b', 'c', 'd'],
      llm,
      signal: controller.signal,
    })
    expect(contexts).toHaveLength(4)
    expect(contexts[0]).toBe('first')
    // After abort, remaining slots are empty strings
    expect(contexts.slice(1)).toEqual(['', '', ''])
  })
})
