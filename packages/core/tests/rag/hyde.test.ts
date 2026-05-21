import { describe, it, expect, vi } from 'vitest'
import { generateHypotheticalAnswer } from '../../src/rag/hyde.js'

function fakeLLM(output: string) {
  return {
    name: 'mock', type: 'model' as const, version: '0', coreVersion: '^0',
    capabilities: { llm: true },
    generate: vi.fn(async function*(): AsyncIterable<string> { yield output }),
    setup: async () => {}, healthCheck: async () => ({ healthy: true }),
  } as any
}

describe('generateHypotheticalAnswer', () => {
  it('returns the LLM-generated hypothetical passage', async () => {
    const llm = fakeLLM('Redis is an in-memory key-value store commonly used for caching.')
    const out = await generateHypotheticalAnswer('What is Redis?', llm)
    expect(out).toContain('Redis')
    expect(out.length).toBeGreaterThan(10)
  })

  it('trims surrounding whitespace', async () => {
    const llm = fakeLLM('  spaced output  \n')
    const out = await generateHypotheticalAnswer('q', llm)
    expect(out).toBe('spaced output')
  })

  it('returns empty string when the LLM throws', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> { throw new Error('boom') }),
    }
    const out = await generateHypotheticalAnswer('q', llm)
    expect(out).toBe('')
  })

  it('returns empty string when the model does not expose generate()', async () => {
    const llm: any = { capabilities: { embedding: true } }
    const out = await generateHypotheticalAnswer('q', llm)
    expect(out).toBe('')
  })

  it('passes a passage-style prompt (no chat preamble)', async () => {
    const llm = fakeLLM('passage')
    await generateHypotheticalAnswer('What is Redis?', llm)
    const callArgs = (llm.generate as any).mock.calls[0]
    const prompt = callArgs[0] as string
    expect(prompt).toContain('What is Redis?')
    // The prompt must instruct the LLM to write like a reference document, not a chat reply
    expect(/passage|extract|reference|document/i.test(prompt)).toBe(true)
  })
})
