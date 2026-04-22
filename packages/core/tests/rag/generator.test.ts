import { describe, it, expect } from 'vitest'
import { buildPrompt, type GenerateInput } from '../../src/rag/generator.js'

describe('buildPrompt', () => {
  const baseInput: GenerateInput = {
    query: 'How to configure Redis?',
    context: [
      {
        chunkId: 'c1', content: 'Redis can be configured via redis.conf file.',
        score: 0.9, documentId: 'd1', chunkType: 'semantic',
        headingHierarchy: ['Redis', 'Configuration'], sourcePath: '/docs/redis.md', sourceType: 'local',
      },
    ],
    intent: 'config',
  }

  it('includes structured rules section', () => {
    const prompt = buildPrompt(baseInput)
    expect(prompt).toContain('RULES')
    expect(prompt).toContain('ONLY use information')
  })

  it('includes response format instructions', () => {
    const prompt = buildPrompt(baseInput)
    expect(prompt).toContain('RESPONSE FORMAT')
  })

  it('includes source citations in context block', () => {
    const prompt = buildPrompt(baseInput)
    expect(prompt).toContain('[Source: /docs/redis.md#Configuration]')
  })

  it('includes conversation history when provided', () => {
    const input = { ...baseInput, conversationHistory: 'User: What is Redis?\nAssistant: Redis is a cache.' }
    const prompt = buildPrompt(input)
    expect(prompt).toContain('What is Redis?')
  })

  it('handles empty context gracefully', () => {
    const input = { ...baseInput, context: [] }
    const prompt = buildPrompt(input)
    expect(prompt).toContain('No relevant documentation found')
  })

  it('uses intent-specific system prompt', () => {
    const prompt = buildPrompt(baseInput)
    expect(prompt).toContain('configuration')
  })
})
