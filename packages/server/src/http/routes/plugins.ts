import { Hono } from 'hono'
import { execSync } from 'node:child_process'
import type { AppContext } from '../../bootstrap.js'

const ALLOWED_PREFIX_SCOPED = '@opendocuments/'
const ALLOWED_PREFIX_UNSCOPED = 'opendocuments-'

function isValidPluginName(name: string): boolean {
  return name.startsWith(ALLOWED_PREFIX_UNSCOPED) || name.startsWith(ALLOWED_PREFIX_SCOPED)
}

export function pluginRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/plugins/search', async (c) => {
    const q = c.req.query('q') || ''
    try {
      const raw = execSync(`npm search opendocuments ${q} --json`, { timeout: 30000 }).toString()
      const packages: unknown[] = JSON.parse(raw)
      return c.json({ packages })
    } catch (err) {
      return c.json({ packages: [] })
    }
  })

  app.get('/api/v1/plugins', async (c) => {
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

  app.post('/api/v1/plugins/install', async (c) => {
    const body = await c.req.json<{ name: string }>()
    const name = body?.name?.trim()

    if (!name || !isValidPluginName(name)) {
      return c.json(
        { error: `Invalid plugin name. Package must start with "${ALLOWED_PREFIX_UNSCOPED}" or "${ALLOWED_PREFIX_SCOPED}"` },
        400
      )
    }

    try {
      execSync(`npm install ${name}`, { timeout: 60000 })
      return c.json({ status: 'installed', message: 'Restart server to activate' })
    } catch (err) {
      return c.json({ error: `Install failed: ${(err as Error).message}` }, 500)
    }
  })

  app.delete('/api/v1/plugins/:name', async (c) => {
    const name = c.req.param('name')
    try {
      execSync(`npm uninstall ${name}`, { timeout: 30000 })
      return c.json({ status: 'removed' })
    } catch (err) {
      return c.json({ error: `Uninstall failed: ${(err as Error).message}` }, 500)
    }
  })

  return app
}
