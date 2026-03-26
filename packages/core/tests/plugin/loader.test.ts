// packages/core/tests/plugin/loader.test.ts
import { describe, it, expect } from 'vitest'
import { isValidPlugin } from '../../src/plugin/loader.js'

describe('Plugin Loader', () => {
  it('validates a correct plugin object', () => {
    expect(isValidPlugin({
      name: 'test',
      type: 'parser',
      version: '1.0.0',
      coreVersion: '^0.1.0',
      setup: async () => {},
    })).toBe(true)
  })

  it('rejects null', () => {
    expect(isValidPlugin(null)).toBe(false)
  })

  it('rejects missing name', () => {
    expect(isValidPlugin({
      type: 'parser',
      version: '1.0.0',
      coreVersion: '^0.1.0',
      setup: async () => {},
    })).toBe(false)
  })

  it('rejects invalid type', () => {
    expect(isValidPlugin({
      name: 'test',
      type: 'invalid',
      version: '1.0.0',
      coreVersion: '^0.1.0',
      setup: async () => {},
    })).toBe(false)
  })

  it('rejects missing setup function', () => {
    expect(isValidPlugin({
      name: 'test',
      type: 'parser',
      version: '1.0.0',
      coreVersion: '^0.1.0',
    })).toBe(false)
  })

  it('accepts all valid plugin types', () => {
    for (const type of ['connector', 'parser', 'model', 'middleware']) {
      expect(isValidPlugin({
        name: 'test',
        type,
        version: '1.0.0',
        coreVersion: '^0.1.0',
        setup: async () => {},
      })).toBe(true)
    }
  })
})
