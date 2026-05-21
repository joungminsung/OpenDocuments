import { describe, it, expect, vi } from 'vitest'
import { generatePropositions, generateHypotheticalQuestions } from '../../src/rag/propositions.js'

function fakeLLM(output: string) {
  return {
    name: 'mock', type: 'model' as const, version: '0', coreVersion: '^0',
    capabilities: { llm: true },
    generate: vi.fn(async function*(): AsyncIterable<string> { yield output }),
    setup: async () => {}, healthCheck: async () => ({ healthy: true }),
  } as any
}

describe('generatePropositions', () => {
  it('extracts bulleted atomic facts from a chunk', async () => {
    const llm = fakeLLM('- Redis is in-memory.\n- Redis supports caching.\n- Redis offers pub/sub.')
    const props = await generatePropositions('Redis is an in-memory store that supports caching and pub/sub.', llm)
    expect(props).toHaveLength(3)
    expect(props[0]).toMatch(/in-memory/i)
    expect(props[1]).toMatch(/caching/i)
  })

  it('returns an empty array on LLM failure', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> { throw new Error('boom') }),
    }
    expect(await generatePropositions('x', llm)).toEqual([])
  })

  it('returns an empty array when generate is absent', async () => {
    expect(await generatePropositions('x', { capabilities: { embedding: true } } as any)).toEqual([])
  })

  it('handles numbered, bulleted, and plain-line outputs', async () => {
    const llm = fakeLLM('1. first\n* second\n- third\nfourth')
    const props = await generatePropositions('x', llm)
    expect(props).toEqual(['first', 'second', 'third', 'fourth'])
  })
})

describe('generateHypotheticalQuestions', () => {
  it('produces up to N questions the chunk answers', async () => {
    const llm = fakeLLM('1. What is Redis?\n2. What is Redis used for?\n3. Is Redis in-memory?')
    const qs = await generateHypotheticalQuestions('Redis is an in-memory store...', llm, 2)
    expect(qs).toHaveLength(2)
    expect(qs[0]).toMatch(/\?$/)
  })

  it('trims and filters blanks', async () => {
    const llm = fakeLLM('\n\n1.   What is A?   \n\n2.   What is B?\n\n')
    const qs = await generateHypotheticalQuestions('x', llm, 5)
    expect(qs).toEqual(['What is A?', 'What is B?'])
  })

  it('returns empty array on LLM failure', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> { throw new Error('boom') }),
    }
    expect(await generateHypotheticalQuestions('x', llm, 3)).toEqual([])
  })
})
