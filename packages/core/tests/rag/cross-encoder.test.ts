import { describe, it, expect, vi } from 'vitest'
import { crossEncoderRerank } from '../../src/rag/cross-encoder.js'
import type { SearchResult } from '../../src/ingest/document-store.js'

const mk = (id: string, content: string, score: number): SearchResult => ({
  chunkId: id, content, score, documentId: 'd', chunkType: 'semantic',
  headingHierarchy: [], sourcePath: '', sourceType: 'local',
})

describe('crossEncoderRerank', () => {
  it('reorders results by pairwise LLM scores', async () => {
    // LLM returns 9 if the passage contains "target", else 2
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(prompt: string): AsyncIterable<string> {
        yield /target content here/.test(prompt) ? '9' : '2'
      }),
    }
    const results = [
      mk('a', 'irrelevant content', 0.9),
      mk('b', 'target content here', 0.5),
    ]
    const out = await crossEncoderRerank('find target', results, llm, 2)
    expect(out[0].chunkId).toBe('b')
  })

  it('uses the reranker LLM output as the new score, normalized 0-1', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(prompt: string): AsyncIterable<string> {
        yield prompt.includes('first') ? '7' : '3'
      }),
    }
    const results = [mk('a', 'first one', 0.1), mk('b', 'second one', 0.9)]
    const out = await crossEncoderRerank('q', results, llm, 2)
    expect(out[0].chunkId).toBe('a')
    expect(out[0].score).toBeCloseTo(0.7)
    expect(out[1].score).toBeCloseTo(0.3)
  })

  it('clamps out-of-range scores to [0, 10]', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(prompt: string): AsyncIterable<string> {
        yield prompt.includes('hi') ? '15' : '-3'
      }),
    }
    const results = [mk('a', 'hi', 0.5), mk('b', 'lo', 0.5)]
    const out = await crossEncoderRerank('q', results, llm, 2)
    // 15 -> clamped to 10 -> normalized 1.0; -3 -> clamped to 0
    expect(out[0].score).toBe(1)
    expect(out[1].score).toBe(0)
  })

  it('extracts the first integer if the LLM returns extra text', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> {
        yield 'Score: 8. The passage is highly relevant.'
      }),
    }
    const results = [mk('a', 'x', 0.5)]
    const out = await crossEncoderRerank('q', results, llm, 1)
    expect(out[0].score).toBeCloseTo(0.8)
  })

  it('leaves results unchanged when LLM throws on a single call', async () => {
    // When the very first LLM call in the head batch throws, we fall back to input order unchanged.
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> {
        throw new Error('rate limit')
      }),
    }
    const results = [mk('a', 'x', 0.9), mk('b', 'y', 0.5)]
    const out = await crossEncoderRerank('q', results, llm, 2)
    expect(out.map(r => r.chunkId)).toEqual(['a', 'b'])
    expect(out.map(r => r.score)).toEqual([0.9, 0.5])
  })

  it('passes the tail through untouched when topK < results.length', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> {
        yield '10'
      }),
    }
    const results = [
      mk('head-1', 'h1', 0.5),
      mk('head-2', 'h2', 0.5),
      mk('tail-1', 't1', 0.3),
      mk('tail-2', 't2', 0.2),
    ]
    const out = await crossEncoderRerank('q', results, llm, 2)
    expect(out).toHaveLength(4)
    expect(out.slice(2).map(r => r.chunkId)).toEqual(['tail-1', 'tail-2'])
    expect(out.slice(2).map(r => r.score)).toEqual([0.3, 0.2])
  })

  it('returns results unchanged when generate is absent', async () => {
    const llm: any = { capabilities: { embedding: true } }
    const results = [mk('a', 'x', 0.9), mk('b', 'y', 0.5)]
    const out = await crossEncoderRerank('q', results, llm, 2)
    expect(out).toEqual(results)
  })

  it('returns empty array when input is empty', async () => {
    const llm: any = {
      capabilities: { llm: true },
      generate: vi.fn(async function*(): AsyncIterable<string> { yield '5' }),
    }
    const out = await crossEncoderRerank('q', [], llm, 5)
    expect(out).toEqual([])
    expect(llm.generate).not.toHaveBeenCalled()
  })
})
