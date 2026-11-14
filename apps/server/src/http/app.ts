import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import type { Logger } from '@ytcreator/core'
import { Hono } from 'hono'
import type { LimitsRepo } from '../db/repos/limits.ts'
import type { OnboardingRepo } from '../db/repos/onboarding.ts'
import type { SettingsRepo } from '../db/repos/settings.ts'
import type { AiConnectionsService } from '../services/ai-connections.ts'
import type { ClaudeRepair } from '../services/claude-repair.ts'
import type { JobsService } from '../services/jobs.ts'
import { ApiError } from './errors.ts'
import { guard } from './guard.ts'
import { aiRoutes } from './routes/ai.ts'
import { channelRoutes, type ChannelRoutesDeps } from './routes/channel.ts'
import { ideaRoutes, type IdeaRoutesDeps } from './routes/ideas.ts'
import { jobsRoutes } from './routes/jobs.ts'
import { scriptRoutes, type ScriptRoutesDeps } from './routes/scripts.ts'
import { packageRoutes, type PackageRoutesDeps } from './routes/packages.ts'
import { knowledgeRoutes, type KnowledgeRoutesDeps } from './routes/knowledge.ts'
import { usageRoutes } from './routes/usage.ts'
import { youtubeSettingsRoutes, type YouTubeSettingsDeps } from './routes/youtube-settings.ts'
import type { UsageRepo } from '../db/repos/usage.ts'
import { youtubeRoutes, type YouTubeRoutesDeps } from './routes/youtube.ts'
import { onboardingRoutes } from './routes/onboarding.ts'
import { settingsRoutes } from './routes/settings.ts'
import { updatesRoutes } from './routes/updates.ts'

export interface AppDeps {
  port: number
  version: string
  instanceId: string
  logger: Logger
  // Folder of the compiled SPA (`web/` next to server.mjs); null in development, where Vite serves it.
  webDir: string | null
  // Called after the shutdown response is sent (R4, contracts/http-api.md); absent in tests that don't need it.
  onShutdown?: () => void
  // The feature routes; absent in tests that only exercise the shell of the app.
  onboarding?: OnboardingRepo
  ai?: AiConnectionsService
  repair?: ClaudeRepair
  limits?: LimitsRepo
  settings?: SettingsRepo
  channel?: ChannelRoutesDeps
  ideas?: IdeaRoutesDeps
  script?: ScriptRoutesDeps
  publish?: PackageRoutesDeps
  jobs?: JobsService
  youtube?: YouTubeRoutesDeps
  youtubeSettings?: YouTubeSettingsDeps
  usage?: UsageRepo
  knowledge?: KnowledgeRoutesDeps
  now?: () => Date
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
  // The image of the creator's channel comes from YouTube (US4 AS1, entry 56): `safeThumbnail` lets through only what
  // these allow. Nothing else is loaded from outside.
  return `default-src 'self'${scripts}; img-src 'self' https://*.ggpht.com https://*.googleusercontent.com; frame-ancestors 'none'`
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
  // The web dev server's own port (apps/web/vite.config.ts); only reachable when Vite serves the SPA (webDir null).
  app.use('/api/*', guard(deps.port, deps.webDir === null ? 'http://127.0.0.1:5174' : undefined))

  app.get('/api/health', (c) => c.json({ app: 'ytcreator', version: deps.version, instanceId: deps.instanceId }))

  // Responds first; the actual shutdown runs once the response has gone out (setImmediate, after the I/O flush).
  app.post('/api/app/shutdown', (c) => {
    if (deps.onShutdown) setImmediate(deps.onShutdown)
    return c.json({}, 202)
  })

  if (deps.onboarding) app.route('/api/onboarding', onboardingRoutes(deps.onboarding))
  if (deps.ai) app.route('/api/ai', aiRoutes(deps.ai, deps.repair))
  if (deps.youtubeSettings) app.route('/api/settings/youtube', youtubeSettingsRoutes(deps.youtubeSettings))
  if (deps.knowledge) app.route('/api/settings/knowledge', knowledgeRoutes(deps.knowledge))
  if (deps.usage) app.route('/api/usage', usageRoutes({ usage: deps.usage, ...(deps.now ? { now: deps.now } : {}) }))
  if (deps.limits && deps.settings)
    app.route('/api/settings', settingsRoutes({ limits: deps.limits, settings: deps.settings }))
  if (deps.settings) app.route('/api/updates', updatesRoutes({ settings: deps.settings, version: deps.version }))

  if (deps.channel) app.route('/api', channelRoutes(deps.channel))
  if (deps.ideas) app.route('/api', ideaRoutes(deps.ideas))
  if (deps.script) app.route('/api', scriptRoutes(deps.script))
  if (deps.publish) app.route('/api', packageRoutes(deps.publish))
  if (deps.youtube) app.route('/api', youtubeRoutes(deps.youtube))
  if (deps.jobs) app.route('/api/jobs', jobsRoutes(deps.jobs))

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
