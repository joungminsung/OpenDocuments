import { Hono } from 'hono'
import { execFileSync } from 'node:child_process'
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
      execFileSync(npmCommand(), ['install', name], { encoding: 'utf-8', timeout: 60000 })
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
      execFileSync(npmCommand(), ['uninstall', name], { encoding: 'utf-8', timeout: 30000 })
      return c.json({ status: 'removed' })
    } catch (err) {
      return c.json({ error: `Uninstall failed: ${(err as Error).message}` }, 500)
    }
  })

  return app
}
