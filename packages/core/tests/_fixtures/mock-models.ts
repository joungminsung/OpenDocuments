import { vi } from 'vitest'
import type { ModelPlugin } from '../../src/plugin/interfaces.js'

export function createMockEmbedder(): ModelPlugin {
  return {
    name: '@opendocs/model-mock-embedder',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { embedding: true },
    setup: vi.fn().mockResolvedValue(undefined),
    async embed(texts: string[]) {
      return {
        dense: texts.map(t => {
          const h = t.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
          return [Math.sin(h), Math.cos(h), Math.sin(h * 2)]
        }),
      }
    },
  }
}

export function createMockLLM(): ModelPlugin {
  return {
    name: '@opendocs/model-mock-llm',
    type: 'model',
    version: '0.1.0',
    coreVersion: '^0.1.0',
    capabilities: { llm: true },
    setup: vi.fn().mockResolvedValue(undefined),
    async *generate(prompt: string) {
      yield 'Based on the context, '
      yield 'here is the answer.'
    },
  }
}
