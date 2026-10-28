import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import type { Logger } from '@ytcreator/core'
import { Hono } from 'hono'
import { ApiError } from './errors.ts'
import { guard } from './guard.ts'

export interface AppDeps {
  port: number
  version: string
  instanceId: string
  logger: Logger
  // Folder of the compiled SPA (`web/` next to server.mjs); null in development, where Vite serves it.
  webDir: string | null
  // Called after the shutdown response is sent (R4, contracts/http-api.md); absent in tests that don't need it.
  onShutdown?: () => void
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

// The theme init script of 001 is inline in index.html: the CSP allows it by hash (R5).
function contentSecurityPolicy(indexHtml: string | null): string {
  const hashes = [...(indexHtml ?? '').matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, code]) =>
      `'sha256-${createHash('sha256')
        .update(code ?? '')
        .digest('base64')}'`,
  )
  const scripts = hashes.length > 0 ? `; script-src 'self' ${hashes.join(' ')}` : ''
  return `default-src 'self'${scripts}; frame-ancestors 'none'`
}

function readStatic(webDir: string, path: string): { body: Buffer; type: string } | null {
  const root = resolve(webDir)
  const file = resolve(root, '.' + decodeURIComponent(path))
  if (file !== root && !file.startsWith(root + sep)) return null
  try {
    if (!statSync(file).isFile()) return null
    return { body: readFileSync(file), type: MIME[extname(file)] ?? 'application/octet-stream' }
  } catch {
    return null
  }
}

export function createApp(deps: AppDeps) {
  const indexHtml = deps.webDir ? readFileSync(join(deps.webDir, 'index.html'), 'utf8') : null
  const csp = contentSecurityPolicy(indexHtml)
  const app = new Hono()

  app.use('*', async (c, next) => {
    await next()
    c.header('Content-Security-Policy', csp)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
  })
  app.use('/api/*', guard(deps.port))

  app.get('/api/health', (c) => c.json({ app: 'ytcreator', version: deps.version, instanceId: deps.instanceId }))

  // Responds first; the actual shutdown runs once the response has gone out (setImmediate, after the I/O flush).
  app.post('/api/app/shutdown', (c) => {
    if (deps.onShutdown) setImmediate(deps.onShutdown)
    return c.json({}, 202)
  })

  // Fallback after every route, so routes registered later still match: static files, else the SPA.
  app.notFound((c) => {
    if (c.req.method !== 'GET' || c.req.path.startsWith('/api/') || deps.webDir === null || indexHtml === null) {
      return c.json({ error: { code: 'no_encontrado' } }, 404)
    }
    const file = readStatic(deps.webDir, c.req.path)
    if (file) return c.body(new Uint8Array(file.body), 200, { 'Content-Type': file.type })
    return c.html(indexHtml)
  })

  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json({ error: error.body }, error.status)
    deps.logger.error('http.unhandled', { method: c.req.method, path: c.req.path, error })
    return c.json({ error: { code: 'interno' } }, 500)
  })

  return app
}
