import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

  it('loads config from opendocuments.config.ts file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-config-'))

    try {
      writeFileSync(join(tempDir, 'opendocuments.config.ts'), `
        export default {
          workspace: 'test-workspace',
          mode: 'team' as const,
          rag: { profile: 'precise' as const },
        }
      `)

      const config = loadConfig(tempDir)
      expect(config.workspace).toBe('test-workspace')
      expect(config.mode).toBe('team')
      expect(config.rag.profile).toBe('precise')
      // Defaults should still fill in missing values
      expect(config.model.provider).toBe('ollama')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('falls back to defaults on invalid config file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'opendocuments-config-'))

    try {
      writeFileSync(join(tempDir, 'opendocuments.config.ts'), `
        export default {
          mode: 'invalid-mode',
        }
      `)

      const config = loadConfig(tempDir)
      // Should fall back to defaults when validation fails
      expect(config).toEqual(DEFAULT_CONFIG)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
