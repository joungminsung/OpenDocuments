import { describe, it, expect } from 'vitest'
import {
  validatePluginPermissions,
  enforceNetworkPermission,
  enforceFilesystemPermission,
} from '../../src/plugin/sandbox.js'

describe('validatePluginPermissions', () => {
  it('returns all-true defaults when permissions are undefined', () => {
    const resolved = validatePluginPermissions(undefined)
    expect(resolved.network).toBe(true)
    expect(resolved.filesystem).toBe(true)
    expect(resolved.env).toEqual([])
    expect(resolved.events).toEqual([])
  })

  it('restricts network when a list of hostnames is provided', () => {
    const resolved = validatePluginPermissions({ network: ['api.github.com'] })
    expect(resolved.network).toEqual(['api.github.com'])
    expect(resolved.filesystem).toBe(true)
  })

  it('fully disables network when set to false', () => {
    const resolved = validatePluginPermissions({ network: false })
    expect(resolved.network).toBe(false)
  })

  it('propagates env and events arrays', () => {
    const resolved = validatePluginPermissions({ env: ['HOME', 'PATH'], events: ['after:retrieve'] })
    expect(resolved.env).toEqual(['HOME', 'PATH'])
    expect(resolved.events).toEqual(['after:retrieve'])
  })

  it('defaults missing fields to permissive values when partial permissions are given', () => {
    const resolved = validatePluginPermissions({ network: false })
    expect(resolved.filesystem).toBe(true)
    expect(resolved.env).toEqual([])
    expect(resolved.events).toEqual([])
  })
})

describe('enforceNetworkPermission', () => {
  it('allows any URL when permission is true', () => {
    expect(enforceNetworkPermission(true, 'https://evil.com/hack')).toBe(true)
    expect(enforceNetworkPermission(true, 'http://localhost:3000')).toBe(true)
  })

  it('blocks any URL when permission is false', () => {
    expect(enforceNetworkPermission(false, 'https://api.github.com/repos')).toBe(false)
    expect(enforceNetworkPermission(false, 'https://example.com')).toBe(false)
  })

  it('allows a URL whose hostname matches an entry in the allowlist', () => {
    expect(
      enforceNetworkPermission(['api.github.com'], 'https://api.github.com/repos')
    ).toBe(true)
  })

  it('blocks a URL whose hostname is not in the allowlist', () => {
    expect(
      enforceNetworkPermission(['api.github.com'], 'https://evil.com/steal')
    ).toBe(false)
  })

  it('allows subdomains of an allowed entry', () => {
    expect(
      enforceNetworkPermission(['github.com'], 'https://api.github.com/repos')
    ).toBe(true)
  })

  it('blocks an exact hostname that only partially matches an entry', () => {
    expect(
      enforceNetworkPermission(['github.com'], 'https://notgithub.com')
    ).toBe(false)
  })

  it('returns false for a malformed URL', () => {
    expect(enforceNetworkPermission(['api.github.com'], 'not-a-url')).toBe(false)
  })
})

describe('enforceFilesystemPermission', () => {
  it('allows any path when permission is true', () => {
    expect(enforceFilesystemPermission(true, '/etc/passwd')).toBe(true)
    expect(enforceFilesystemPermission(true, '/tmp/data')).toBe(true)
  })

  it('blocks any path when permission is false', () => {
    expect(enforceFilesystemPermission(false, '/tmp/safe')).toBe(false)
    expect(enforceFilesystemPermission(false, '/home/user/docs')).toBe(false)
  })

  it('allows a path that starts with an allowed prefix', () => {
    expect(
      enforceFilesystemPermission(['/tmp/opendocs'], '/tmp/opendocs/data.json')
    ).toBe(true)
  })

  it('blocks a path that does not start with any allowed prefix', () => {
    expect(
      enforceFilesystemPermission(['/tmp/opendocs'], '/etc/secret')
    ).toBe(false)
  })

  it('allows the exact allowed prefix path itself', () => {
    expect(
      enforceFilesystemPermission(['/tmp/opendocs'], '/tmp/opendocs')
    ).toBe(true)
  })

  it('allows multiple allowed prefixes and matches any', () => {
    expect(
      enforceFilesystemPermission(['/tmp/opendocs', '/var/data'], '/var/data/report.csv')
    ).toBe(true)
  })

  it('blocks a path when none of the multiple prefixes match', () => {
    expect(
      enforceFilesystemPermission(['/tmp/opendocs', '/var/data'], '/etc/hosts')
    ).toBe(false)
  })
})
