// packages/core/src/plugin/loader.ts
import type { AnyPlugin, PluginType } from './interfaces.js'

export interface LoadedPlugin {
  plugin: AnyPlugin
  source: 'builtin' | 'npm' | 'local'
}

/**
 * Resolve a plugin name to its module path.
 * - Built-in plugins: returned directly from a registry
 * - npm plugins: resolved via require/import
 * - Local plugins: loaded from filesystem path
 */
export async function loadPlugin(name: string): Promise<AnyPlugin> {
  try {
    const mod = await import(name)
    const plugin = mod.default ?? mod

    if (!isValidPlugin(plugin)) {
      throw new Error(`Plugin ${name} does not export a valid OpenDocs plugin`)
    }

    return plugin as AnyPlugin
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(`Plugin ${name} not found. Is it installed? Run: npm install ${name}`)
    }
    throw err
  }
}

/**
 * Validate that an object satisfies the minimum plugin interface.
 */
export function isValidPlugin(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false

  const p = obj as Record<string, unknown>

  // Required fields
  if (typeof p.name !== 'string') return false
  if (!['connector', 'parser', 'model', 'middleware'].includes(p.type as string)) return false
  if (typeof p.version !== 'string') return false
  if (typeof p.coreVersion !== 'string') return false
  if (typeof p.setup !== 'function') return false

  return true
}

/**
 * Load multiple plugins by name.
 * Returns successfully loaded plugins and any errors.
 */
export async function loadPlugins(names: string[]): Promise<{
  loaded: AnyPlugin[]
  errors: { name: string; error: string }[]
}> {
  const loaded: AnyPlugin[] = []
  const errors: { name: string; error: string }[] = []

  for (const name of names) {
    try {
      const plugin = await loadPlugin(name)
      loaded.push(plugin)
    } catch (err) {
      errors.push({ name, error: (err as Error).message })
    }
  }

  return { loaded, errors }
}
