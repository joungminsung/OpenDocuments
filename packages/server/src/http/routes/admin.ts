import { Hono } from 'hono'
import type { AppContext } from '../../bootstrap.js'
import { requireRole } from '../middleware/auth.js'

export function adminRoutes(ctx: AppContext) {
  const app = new Hono()

  app.get('/api/v1/admin/audit-logs', requireRole('admin'), (c) => {
    const limit = parseInt(c.req.query('limit') || '100', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    const eventType = c.req.query('eventType') || undefined
    const workspaceId = c.req.query('workspaceId') || undefined

    const entries = ctx.auditLogger.query({ limit, offset, eventType, workspaceId })
    return c.json({ entries })
  })

  return app
}
