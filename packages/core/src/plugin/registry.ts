import type {
  AnyPlugin,
  PluginType,
  PluginContext,
  ParserPlugin,
  ConnectorPlugin,
  ModelPlugin,
  MiddlewarePlugin,
} from './interfaces.js'
import { checkCompatibility } from './capability.js'

export class PluginRegistry {
  private plugins = new Map<string, AnyPlugin>()

  constructor(private coreVersion: string = '0.3.0') {}

  async register(plugin: AnyPlugin, ctx: PluginContext): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`)
    }

    const compatibility = checkCompatibility(
      plugin,
      this.coreVersion,
      Array.from(this.plugins.keys())
    )

    if (!compatibility.compatible) {
      throw new Error(
        `Plugin ${plugin.name} is not compatible: ${compatibility.errors.join(', ')}`
      )
    }

    await plugin.setup(ctx)
    // Note: Map.set is infallible. If post-setup validation is added in the future,
    // wrap in try/catch and call plugin.teardown() on failure.
    this.plugins.set(plugin.name, plugin)
  }

  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name)
    if (!plugin) return
    if (plugin.teardown) {
      await plugin.teardown()
    }
    this.plugins.delete(name)
  }

  get(name: string): AnyPlugin | undefined {
    return this.plugins.get(name)
  }

  getByType<T extends PluginType>(type: T): AnyPlugin[] {
    return Array.from(this.plugins.values()).filter(p => p.type === type)
  }

  findParserForType(extension: string): ParserPlugin | undefined {
    const parsers = this.getByType('parser') as ParserPlugin[]
    return parsers.find(p => p.supportedTypes.includes(extension))
  }

  getConnectors(): ConnectorPlugin[] {
    return this.getByType('connector') as ConnectorPlugin[]
  }

  getModels(): ModelPlugin[] {
    return this.getByType('model') as ModelPlugin[]
  }

  getMiddleware(): MiddlewarePlugin[] {
    return this.getByType('middleware') as MiddlewarePlugin[]
  }

  listAll(): { name: string; type: PluginType; version: string }[] {
    return Array.from(this.plugins.values()).map(p => ({
      name: p.name,
      type: p.type,
      version: p.version,
    }))
  }

  async teardownAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.teardown) {
        await plugin.teardown()
      }
    }
    this.plugins.clear()
  }
}
