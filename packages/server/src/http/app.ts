import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { join, extname, resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { existsSync, statSync } from 'node:fs'
import { healthRoutes } from './routes/health.js'
import { documentRoutes } from './routes/documents.js'
import { chatRoutes } from './routes/chat.js'
import { conversationRoutes } from './routes/conversations.js'
import { adminRoutes } from './routes/admin.js'
import { tagRoutes } from './routes/tags.js'
import { collectionRoutes } from './routes/collections.js'
import { pluginRoutes } from './routes/plugins.js'
import { authRoutes } from './routes/auth-routes.js'
import { authMiddleware } from './middleware/auth.js'
import { rateLimit } from './middleware/rate-limit.js'
import type { AppContext } from '../bootstrap.js'
import { generateWidgetScript } from '../widget/widget.js'

export interface AppOptions {
  webDir?: string
}

export function createApp(ctx: AppContext, opts?: AppOptions) {
  const app = new Hono()

  // CORS: Allows localhost origins by default for personal mode development.
  // In production team mode, configure allowed origins in opendocuments.config.ts:
  //   security: { access: { allowedOrigins: ['https://your-domain.com'] } }
  // For now, reverse proxy (nginx) CORS headers are recommended for production.
  app.use('*', cors({
    origin: (origin) => {
      // Allow localhost on any port
      if (!origin) return '*'  // same-origin requests
      if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return origin
      }
      // TODO: Read additional origins from config
      return null  // reject other origins
    },
  }))

  // Mount OAuth routes BEFORE authMiddleware (public routes -- no API key required)
  app.route('/', authRoutes(ctx))

  // Auth middleware: personal mode passes through, team mode requires X-API-Key
  app.use('/api/*', authMiddleware(ctx))

  // Rate limiting: 60 requests per minute per API key / IP
  app.use('/api/*', rateLimit({ max: 60, windowMs: 60000 }))

  // Body size limit (50MB)
  const MAX_BODY_SIZE = 50 * 1024 * 1024
  app.use('/api/*', async (c, next) => {
    const contentLength = c.req.header('content-length')
    if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
      return c.json({ error: 'Request body too large (max 50MB)' }, 413)
    }
    await next()
  })

  app.get('/widget.js', (c) => {
    // Check Referer against config.security.access.widgetAllowedDomains
    const referer = c.req.header('referer')
    const allowedDomains = (ctx.config as any)?.security?.access?.widgetAllowedDomains as string[] | undefined
    if (allowedDomains && allowedDomains.length > 0 && referer) {
      try {
        const refOrigin = new URL(referer).origin
        if (!allowedDomains.some(d => refOrigin === d || refOrigin === `https://${d}` || refOrigin === `http://${d}`)) {
          return c.text('Forbidden', 403)
        }
      } catch {}
    }
    return c.body(generateWidgetScript(), { headers: { 'Content-Type': 'application/javascript' } })
  })

  app.route('/', healthRoutes(ctx))
  app.route('/', documentRoutes(ctx))
  app.route('/', chatRoutes(ctx))
  app.route('/', conversationRoutes(ctx))
  app.route('/', adminRoutes(ctx))
  app.route('/', tagRoutes(ctx))
  app.route('/', collectionRoutes(ctx))
  app.route('/', pluginRoutes(ctx))

  app.onError((err, c) => {
    console.error('Unhandled error:', err.message)
    return c.json({
      error: 'Internal server error',
      // Only include message in non-production environments
      ...(process.env.NODE_ENV !== 'production' && { detail: err.message }),
    }, 500)
  })

  // Serve web UI static files if webDir is provided
  if (opts?.webDir) {
    const webDir = opts.webDir

    const MIME_TYPES: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
    }

    app.get('/*', async (c) => {
      const reqPath = c.req.path === '/' ? '/index.html' : c.req.path
      const filePath = resolve(webDir, '.' + reqPath)

      // Prevent path traversal: ensure resolved path stays within webDir
      if (!filePath.startsWith(resolve(webDir) + '/') && filePath !== resolve(webDir)) {
        return c.json({ error: 'Forbidden' }, 403)
      }

      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const content = await readFile(filePath)
        const ext = extname(filePath)
        return c.body(content as unknown as ReadableStream, { headers: { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' } })
      }

      // SPA fallback: serve index.html for any unmatched route
      const indexPath = join(webDir, 'index.html')
      if (existsSync(indexPath)) {
        const indexContent = await readFile(indexPath, 'utf-8')
        return c.html(indexContent)
      }

      return c.json({ error: 'Not found' }, 404)
    })
  } else {
    app.notFound((c) => {
      return c.json({ error: 'Not found' }, 404)
    })
  }

  // TODO(Phase 2): Add WebSocket endpoint at /api/v1/ws/chat
  // Currently covered by SSE streaming at POST /api/v1/chat/stream

  return app
}
