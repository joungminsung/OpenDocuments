import { Hono } from 'hono'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import type { AppContext } from '../../bootstrap.js'
import { requireRole, requireScope } from '../middleware/auth.js'

const ALLOWED_PREFIX_SCOPED = '@opendocuments/'
const ALLOWED_PREFIX_UNSCOPED = 'opendocuments-'
const PLUGIN_NAME_PATTERN = /^(?:@opendocuments\/[a-z0-9][a-z0-9._-]*|opendocuments-[a-z0-9][a-z0-9._-]*)$/i

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function isValidPluginName(name: string): boolean {
  return PLUGIN_NAME_PATTERN.test(name)
}

interface PluginManifest {
  enabled: string[]
  disabled: string[]
}

function readPluginManifest(path: string): PluginManifest {
  try {
    const value: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    if (Array.isArray(value)) {
      return {
        enabled: value.filter((item): item is string => typeof item === 'string'),
        disabled: [],
      }
    }
    if (typeof value === 'object' && value !== null) {
      const manifest = value as { enabled?: unknown; disabled?: unknown }
      return {
        enabled: Array.isArray(manifest.enabled)
          ? manifest.enabled.filter((item): item is string => typeof item === 'string')
          : [],
        disabled: Array.isArray(manifest.disabled)
          ? manifest.disabled.filter((item): item is string => typeof item === 'string')
          : [],
      }
    }
  } catch {
    // Missing or malformed manifests are replaced on the next explicit change.
  }
  return { enabled: [], disabled: [] }
}

function writePluginManifest(path: string, manifest: PluginManifest): void {
  writeFileSync(path, JSON.stringify({
    enabled: [...new Set(manifest.enabled)].sort(),
    disabled: [...new Set(manifest.disabled)].sort(),
  }, null, 2) + '\n', { mode: 0o600 })
}

export function pluginRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/plugins/search', requireRole('admin'), requireScope('admin'), async (c) => {
    const q = c.req.query('q') || ''
    try {
      const raw = execFileSync(
        npmCommand(),
        ['search', 'opendocuments', ...(q ? [q] : []), '--json'],
        { encoding: 'utf-8', timeout: 30000 }
      )
      const packages: unknown[] = JSON.parse(raw)
      return c.json({ packages })
    } catch (err) {
      return c.json({ packages: [] })
    }
  })

  app.get('/api/v1/plugins', requireRole('admin'), requireScope('admin'), async (c) => {
    const plugins = ctx.registry.listAll()
    const details = await Promise.all(
      plugins.map(async (p) => {
        const plugin = ctx.registry.get(p.name)
        let health: { healthy: boolean; message?: string } = { healthy: true }
        try {
          if (plugin?.healthCheck) health = await plugin.healthCheck()
        } catch (err) {
          health = { healthy: false, message: (err as Error).message }
        }
        return { ...p, health }
      })
    )
    return c.json({ plugins: details })
  })

  app.post('/api/v1/plugins/install', requireRole('admin'), requireScope('admin'), async (c) => {
    const body = await c.req.json<{ name: string }>()
    const name = body?.name?.trim()

    if (!name || !isValidPluginName(name)) {
      return c.json(
        { error: `Invalid plugin name. Package must start with "${ALLOWED_PREFIX_UNSCOPED}" or "${ALLOWED_PREFIX_SCOPED}"` },
        400
      )
    }

    try {
      execFileSync(npmCommand(), ['install', name], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 60000,
      })
      const manifest = readPluginManifest(ctx.pluginManifestPath)
      writePluginManifest(ctx.pluginManifestPath, {
        enabled: [...manifest.enabled, name],
        disabled: manifest.disabled.filter((pluginName) => pluginName !== name),
      })
      return c.json({ status: 'installed', message: 'Restart server to activate' })
    } catch (err) {
      return c.json({ error: `Install failed: ${(err as Error).message}` }, 500)
    }
  })

  app.delete('/api/v1/plugins/:name', requireRole('admin'), requireScope('admin'), async (c) => {
    const name = (c.req.param('name') || '').trim()
    if (!isValidPluginName(name)) {
      return c.json(
        { error: `Invalid plugin name. Package must start with "${ALLOWED_PREFIX_UNSCOPED}" or "${ALLOWED_PREFIX_SCOPED}"` },
        400
      )
    }
    try {
      execFileSync(npmCommand(), ['uninstall', name], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 30000,
      })
      const manifest = readPluginManifest(ctx.pluginManifestPath)
      writePluginManifest(ctx.pluginManifestPath, {
        enabled: manifest.enabled.filter((pluginName) => pluginName !== name),
        disabled: [...manifest.disabled, name],
      })
      return c.json({ status: 'removed', message: 'Restart server to finish deactivation' })
    } catch (err) {
      return c.json({ error: `Uninstall failed: ${(err as Error).message}` }, 500)
    }
  })

  return app
}
