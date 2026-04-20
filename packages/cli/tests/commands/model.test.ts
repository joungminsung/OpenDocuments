import { describe, it, expect } from 'vitest'
import { rewriteModelBlock } from '../../src/commands/model.js'

const SAMPLE_CONFIG = `import { defineConfig } from 'opendocuments-core'

export default defineConfig({
  workspace: 'demo',
  mode: 'personal',

  model: {
    provider: 'ollama',
    llm: 'qwen2.5:14b',
    embedding: 'bge-m3',
  },

  rag: {
    profile: 'balanced',
  },
})
`

describe('rewriteModelBlock', () => {
  it('switches to a cloud provider and adds apiKey', () => {
    const out = rewriteModelBlock(SAMPLE_CONFIG, {
      provider: 'deepseek',
      llm: 'deepseek-chat',
      embedding: 'bge-m3',
      embeddingProvider: 'ollama',
    })
    expect(out).toContain(`provider: 'deepseek',`)
    expect(out).toContain(`llm: 'deepseek-chat',`)
    expect(out).toContain(`embeddingProvider: 'ollama',`)
    expect(out).toContain(`apiKey: process.env.DEEPSEEK_API_KEY,`)
    // Outside model block is preserved
    expect(out).toContain(`profile: 'balanced',`)
  })

  it('supports openai-compatible provider with baseUrl', () => {
    const out = rewriteModelBlock(SAMPLE_CONFIG, {
      provider: 'openai-compatible',
      llm: 'llama-4-70b',
      embedding: 'bge-m3',
      embeddingProvider: 'ollama',
      baseUrl: 'https://api.groq.com/openai/v1',
    })
    expect(out).toContain(`baseUrl: 'https://api.groq.com/openai/v1',`)
    expect(out).toContain(`apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,`)
  })

  it('round-trips back to ollama without apiKey line', () => {
    const withCloud = rewriteModelBlock(SAMPLE_CONFIG, {
      provider: 'openai',
      llm: 'gpt-4o',
      embedding: 'text-embedding-3-small',
    })
    const back = rewriteModelBlock(withCloud, {
      provider: 'ollama',
      llm: 'gemma3:12b',
      embedding: 'bge-m3',
    })
    expect(back).toContain(`provider: 'ollama',`)
    expect(back).toContain(`llm: 'gemma3:12b',`)
    expect(back).not.toContain('apiKey: process.env')
  })

  it('throws when model block is missing', () => {
    expect(() => rewriteModelBlock('export default {}', {
      provider: 'openai',
      llm: 'x',
      embedding: 'y',
    })).toThrow(/model:/)
  })
})
