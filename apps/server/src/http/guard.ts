import type { MiddlewareHandler } from 'hono'

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
// The one body that is not JSON: the audio of the subtitles (007, R4). `audio/wav` is not a type a form can send, so
// another site still needs a preflight that the Origin check then refuses (decision 24).
const AUDIO_UPLOAD = /^\/api\/scripts\/[^/]+\/subtitles\/audio$/

// A browser always labels a body it sends, so a declared type or a declared length both count as a body.
function hasBody(headers: Headers): boolean {
  const length = headers.get('content-length')
  return headers.has('content-type') || (length !== null && length !== '0') || headers.has('transfer-encoding')
}

// R5: Host stops DNS rebinding; Origin stops CSRF from other sites; JSON-only bodies force a preflight.
// `devOrigin`: in development the browser talks to Vite (apps/web/vite.config.ts), which proxies to this server
// without rewriting Origin, so its own origin must be allowed too; absent in production, where Vite serves nothing.
export function guard(port: number, devOrigin?: string): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const origins = new Set([...[...hosts].map((host) => `http://${host}`), ...(devOrigin ? [devOrigin] : [])])

  return async (c, next) => {
    const headers = c.req.raw.headers
    const host = headers.get('host')
    let allowed = host !== null && hosts.has(host)
    if (allowed && MUTATIONS.has(c.req.method)) {
      const origin = headers.get('origin')
      allowed = origin !== null && origins.has(origin)
      if (allowed && hasBody(headers)) {
        const type = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
        allowed =
          type === 'application/json' ||
          (type === 'audio/wav' && c.req.method === 'PUT' && AUDIO_UPLOAD.test(c.req.path))
      }
    }
    if (!allowed) return c.json({ error: { code: 'prohibido' } }, 403)
    await next()
  }
}
