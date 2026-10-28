import type { MiddlewareHandler } from 'hono'

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// A browser always labels a body it sends, so a declared type or a declared length both count as a body.
function hasBody(headers: Headers): boolean {
  const length = headers.get('content-length')
  return headers.has('content-type') || (length !== null && length !== '0') || headers.has('transfer-encoding')
}

// R5: Host stops DNS rebinding; Origin stops CSRF from other sites; JSON-only bodies force a preflight.
export function guard(port: number): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const origins = new Set([...hosts].map((host) => `http://${host}`))

  return async (c, next) => {
    const headers = c.req.raw.headers
    const host = headers.get('host')
    let allowed = host !== null && hosts.has(host)
    if (allowed && MUTATIONS.has(c.req.method)) {
      const origin = headers.get('origin')
      allowed = origin !== null && origins.has(origin)
      if (allowed && hasBody(headers)) {
        const type = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
        allowed = type === 'application/json'
      }
    }
    if (!allowed) return c.json({ error: { code: 'prohibido' } }, 403)
    await next()
  }
}
