import { describe, it, expect } from 'vitest'
import { checkCompatibility } from '../../src/plugin/capability.js'
import type { AnyPlugin } from '../../src/plugin/interfaces.js'

function fakePlugin(overrides: Partial<AnyPlugin>): AnyPlugin {
  return {
    name: 'test-plugin',
    type: 'parser',
    version: '1.0.0',
    coreVersion: '^0.3.0',
    supportedTypes: [],
    setup: async () => {},
    parse: async function* () {},
    ...overrides,
  } as AnyPlugin
}

describe('checkCompatibility', () => {
  it('passes when core version satisfies plugin requirement', () => {
    const result = checkCompatibility(fakePlugin({ coreVersion: '^0.3.0' }), '0.3.0', [])
    expect(result.compatible).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails when core version does not satisfy', () => {
    const result = checkCompatibility(fakePlugin({ coreVersion: '^2.0.0' }), '0.3.0', [])
    expect(result.compatible).toBe(false)
    expect(result.errors[0]).toContain('core version')
  })

  it('fails when a dependency is missing', () => {
    const result = checkCompatibility(
      fakePlugin({ dependencies: ['@opendocuments/parser-pdf'] }),
      '0.3.0',
      ['@opendocuments/parser-docx']
    )
    expect(result.compatible).toBe(false)
    expect(result.errors[0]).toContain('@opendocuments/parser-pdf')
  })

  it('passes when all dependencies are present', () => {
    const result = checkCompatibility(
      fakePlugin({ dependencies: ['@opendocuments/parser-pdf'] }),
      '0.3.0',
      ['@opendocuments/parser-pdf']
    )
    expect(result.compatible).toBe(true)
  })

  it('fails when a conflicting plugin is installed', () => {
    const result = checkCompatibility(
      fakePlugin({ conflicts: ['old-parser'] }),
      '0.3.0',
      ['old-parser']
    )
    expect(result.compatible).toBe(false)
    expect(result.errors[0]).toContain('old-parser')
  })
})
