import { describe, it, expect, vi } from 'vitest'
import { PluginRegistry } from '../../src/plugin/registry.js'
import type { ParserPlugin, ConnectorPlugin, PluginContext } from '../../src/plugin/interfaces.js'

function createMockParser(overrides: Partial<ParserPlugin> = {}): ParserPlugin {
  return {
    name: '@opendocuments/parser-test',
    type: 'parser',
    version: '1.0.0',
    coreVersion: '^0.3.0',
    supportedTypes: ['.test'],
    setup: vi.fn().mockResolvedValue(undefined),
    teardown: vi.fn().mockResolvedValue(undefined),
    parse: vi.fn(),
    ...overrides,
  }
}

function createMockConnector(overrides: Partial<ConnectorPlugin> = {}): ConnectorPlugin {
  return {
    name: '@opendocuments/plugin-test',
    type: 'connector',
    version: '1.0.0',
    coreVersion: '^0.3.0',
    setup: vi.fn().mockResolvedValue(undefined),
    discover: vi.fn(),
    fetch: vi.fn(),
    ...overrides,
  }
}

describe('PluginRegistry', () => {
  it('registers and retrieves a plugin by name', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    await registry.register(parser, { config: {}, dataDir: '/tmp', log: console as any })
    expect(registry.get('@opendocuments/parser-test')).toBe(parser)
    expect(parser.setup).toHaveBeenCalled()
  })

  it('lists plugins by type', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const connector = createMockConnector()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }
    await registry.register(parser, ctx)
    await registry.register(connector, ctx)
    expect(registry.getByType('parser')).toEqual([parser])
    expect(registry.getByType('connector')).toEqual([connector])
  })

  it('rejects duplicate plugin names', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }
    await registry.register(parser, ctx)
    await expect(registry.register(parser, ctx)).rejects.toThrow('Plugin @opendocuments/parser-test is already registered')
  })

  it('unregisters a plugin and calls teardown', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }
    await registry.register(parser, ctx)
    await registry.unregister('@opendocuments/parser-test')
    expect(registry.get('@opendocuments/parser-test')).toBeUndefined()
    expect(parser.teardown).toHaveBeenCalled()
  })

  it('finds parsers by file extension', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser({ supportedTypes: ['.md', '.mdx'] })
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }
    await registry.register(parser, ctx)
    expect(registry.findParserForType('.md')).toBe(parser)
    expect(registry.findParserForType('.pdf')).toBeUndefined()
  })

  it('rejects incompatible plugins', async () => {
    const registry = new PluginRegistry('0.3.0')
    const parser = createMockParser({ coreVersion: '^5.0.0' })
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }

    await expect(registry.register(parser, ctx)).rejects.toThrow('not compatible')
  })

  it('returns all registered plugin names', async () => {
    const registry = new PluginRegistry()
    const parser = createMockParser()
    const connector = createMockConnector()
    const ctx: PluginContext = { config: {}, dataDir: '/tmp', log: console as any }
    await registry.register(parser, ctx)
    await registry.register(connector, ctx)
    expect(registry.listAll()).toEqual([
      { name: '@opendocuments/parser-test', type: 'parser', version: '1.0.0' },
      { name: '@opendocuments/plugin-test', type: 'connector', version: '1.0.0' },
    ])
  })
})
