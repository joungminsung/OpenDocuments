import { describe, it, expect } from 'vitest'
import { loadConfig, validateConfig } from '../../src/config/loader.js'
import { DEFAULT_CONFIG } from '../../src/config/defaults.js'

describe('validateConfig', () => {
  it('returns defaults for empty object', () => {
    const config = validateConfig({})
    expect(config.workspace).toBe('default')
    expect(config.mode).toBe('personal')
    expect(config.rag.profile).toBe('balanced')
    expect(config.storage.db).toBe('sqlite')
  })

  it('merges user overrides with defaults', () => {
    const config = validateConfig({
      workspace: 'my-team',
      mode: 'team',
      rag: { profile: 'precise' },
    })
    expect(config.workspace).toBe('my-team')
    expect(config.mode).toBe('team')
    expect(config.rag.profile).toBe('precise')
    expect(config.model.provider).toBe('ollama')
  })

  it('throws on invalid mode', () => {
    expect(() => validateConfig({ mode: 'invalid' })).toThrow()
  })

  it('throws on invalid rag profile', () => {
    expect(() => validateConfig({ rag: { profile: 'turbo' } })).toThrow()
  })
})

describe('loadConfig', () => {
  it('returns defaults when no config file exists', () => {
    const config = loadConfig('/nonexistent/path')
    expect(config).toEqual(DEFAULT_CONFIG)
  })
})
