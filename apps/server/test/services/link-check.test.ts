import { createServer, type RequestListener, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLinkCheck, isPublicAddress, LINK_CHECK_CONCURRENCY } from '../../src/services/link-check.ts'

const servers: Server[] = []

async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections()
          server.close(resolve)
        }),
    ),
  )
})

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

// Only the checks against the local test server open the door: every other test uses the real rule.
const local = (overrides: Partial<Parameters<typeof createLinkCheck>[0]> = {}) =>
  createLinkCheck({ addressAllowed: () => true, ...overrides, logger: logger() })

const status =
  (code: number): RequestListener =>
  (_, res) => {
    res.statusCode = code
    res.end()
  }

describe('link check: limits', () => {
  it.each(['192.0.2.1', '198.51.100.1', '203.0.113.1', 'fec0::1', '64:ff9b:1::1', '2001::1'])(
    'does not take a reserved range as public: %s',
    (address) => expect(isPublicAddress(address)).toBe(false),
  )

  it('stops when the time for all of them runs out, and says it could not check', async () => {
    const url = await serve(() => undefined)
    const states = await local({ timeoutMs: 5000, totalMs: 50 }).checkAll([`${url}/a`, `${url}/b`])
    expect([...states.values()]).toEqual(['sin_comprobar', 'sin_comprobar'])
  })
})

describe('link check: what a response means', () => {
  it.each([200, 204])('opens with %d', async (code) => {
    expect(await local().check(await serve(status(code)))).toBe('abre')
  })

  it.each([404, 410])('does not open with %d', async (code) => {
    expect(await local().check(await serve(status(code)))).toBe('no_abre')
  })

  it.each([401, 403, 429, 500, 503])('cannot tell with %d', async (code) => {
    expect(await local().check(await serve(status(code)))).toBe('sin_comprobar')
  })

  it('cannot tell when the time runs out', async () => {
    const url = await serve(() => {})
    expect(await local({ timeoutMs: 40 }).check(url)).toBe('sin_comprobar')
  })

  it('does not open when nothing listens', async () => {
    const url = await serve(status(200))
    await new Promise((resolve) => servers.pop()?.close(resolve))
    expect(await local().check(url)).toBe('no_abre')
  })

  it('does not open when the name does not exist', async () => {
    const lookup = ((_: string, __: unknown, done: (error: Error) => void) => {
      done(Object.assign(new Error('nope'), { code: 'ENOTFOUND' }))
    }) as never
    expect(await createLinkCheck({ logger: logger(), lookup }).check('https://no-existe.example/')).toBe('no_abre')
  })

  it('does not read the body', async () => {
    let closed = false
    const url = await serve((_, res) => {
      res.on('close', () => (closed = true))
      res.writeHead(200)
      res.write('inicio')
    })
    expect(await local().check(url)).toBe('abre')
    await vi.waitFor(() => expect(closed).toBe(true))
  })
})

describe('link check: redirects', () => {
  const chain = (length: number): RequestListener => {
    return (req, res) => {
      const step = Number(req.url?.slice(1) || 0)
      if (step >= length) return status(200)(req, res)
      res.writeHead(302, { location: `/${step + 1}` })
      res.end()
    }
  }

  it('follows up to three', async () => {
    expect(await local().check(await serve(chain(3)))).toBe('abre')
  })

  it('stops after three', async () => {
    expect(await local().check(await serve(chain(4)))).toBe('sin_comprobar')
  })

  it('judges the last answer', async () => {
    const url = await serve((req, res) => {
      if (req.url === '/') {
        res.writeHead(301, { location: '/fin' })
        return res.end()
      }
      status(404)(req, res)
    })
    expect(await local().check(url)).toBe('no_abre')
  })

  it.each(['http://127.0.0.1/', 'http://[::1]/', 'http://10.0.0.1/', 'http://169.254.169.254/latest'])(
    'refuses a redirect to %s',
    async (target) => {
      const visited: string[] = []
      const url = await serve((req, res) => {
        visited.push(req.url ?? '')
        res.writeHead(302, { location: target })
        res.end()
      })
      // The test server itself is on 127.0.0.1: only its first visit is let through.
      let first = true
      const addressAllowed = (address: string) => {
        if (first) {
          first = false
          return true
        }
        return isPublicAddress(address)
      }
      expect(await local({ addressAllowed }).check(url)).toBe('no_abre')
      expect(visited).toHaveLength(1)
    },
  )

  it.each(['ftp://a.example/x', 'file:///etc/passwd', 'http://u:p@a.example/'])(
    'refuses a redirect to %s',
    async (target) => {
      const url = await serve((_, res) => {
        res.writeHead(302, { location: target })
        res.end()
      })
      expect(await local().check(url)).toBe('no_abre')
    },
  )
})

describe('link check: addresses it refuses', () => {
  const NOT_PUBLIC = [
    '0.0.0.0',
    '0.1.2.3',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.254',
    '127.0.0.1',
    '127.9.9.9',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '::',
    '::1',
    'fc00::1',
    'fdff::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:7f00:1',
  ]

  const inUrl = (address: string) => (address.includes(':') ? `[${address}]` : address)

  it.each(NOT_PUBLIC)('is not public: %s', (address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each([
    '8.8.8.8',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.0.1',
    '172.32.0.1',
    '2606:4700::1111',
    '::ffff:8.8.8.8',
  ])('is public: %s', (address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each(NOT_PUBLIC)('refuses %s written in the address, without connecting', async (address) => {
    const lookup = vi.fn()
    const check = createLinkCheck({ logger: logger(), lookup: lookup as never, timeoutMs: 500 })
    expect(await check.check(`http://${inUrl(address)}/`)).toBe('no_abre')
    expect(lookup).not.toHaveBeenCalled()
  })

  it.each(['http://2130706433/', 'http://0x7f.1/', 'http://127.1/', 'http://127.0.0.1./'])(
    'refuses the disguised loopback %s',
    async (url) => {
      expect(await createLinkCheck({ logger: logger(), timeoutMs: 500 }).check(url)).toBe('no_abre')
    },
  )

  it.each(NOT_PUBLIC)('refuses a name that resolves to %s', async (address) => {
    const family = address.includes(':') ? 6 : 4
    const lookup = ((_: string, options: { all?: boolean }, done: (...args: unknown[]) => void) => {
      if (options.all) done(null, [{ address, family }])
      else done(null, address, family)
    }) as never
    expect(await createLinkCheck({ logger: logger(), lookup, timeoutMs: 500 }).check('http://interno.example/')).toBe(
      'no_abre',
    )
  })

  it('refuses a name when any of its addresses is not public', async () => {
    const lookup = ((_: string, options: { all?: boolean }, done: (...args: unknown[]) => void) => {
      if (options.all)
        done(null, [
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ])
      else done(null, '127.0.0.1', 4)
    }) as never
    expect(await createLinkCheck({ logger: logger(), lookup, timeoutMs: 500 }).check('http://mixto.example/')).toBe(
      'no_abre',
    )
  })

  it.each(['ftp://a.example/x', 'file:///etc/passwd', 'javascript:alert(1)', 'nada', ''])(
    'only takes http and https: %s',
    async (url) => {
      expect(await createLinkCheck({ logger: logger() }).check(url)).toBe('no_abre')
    },
  )

  it.each(['http://usuario@a.example/', 'https://u:p@a.example/'])('refuses a user in the address: %s', async (url) => {
    expect(await createLinkCheck({ logger: logger() }).check(url)).toBe('no_abre')
  })
})

describe('link check: several at once', () => {
  it('answers each address once and in a map', async () => {
    let hits = 0
    const base = await serve((req, res) => {
      hits += 1
      status(req.url === '/roto' ? 404 : 200)(req, res)
    })
    const states = await local().checkAll([`${base}/uno`, `${base}/uno`, `${base}/roto`])
    expect(states.get(`${base}/uno`)).toBe('abre')
    expect(states.get(`${base}/roto`)).toBe('no_abre')
    expect(hits).toBe(2)
  })

  it(`never opens more than ${LINK_CHECK_CONCURRENCY} at once`, async () => {
    let open = 0
    let peak = 0
    const base = await serve((_, res) => {
      open += 1
      peak = Math.max(peak, open)
      setTimeout(() => {
        open -= 1
        res.end()
      }, 20)
    })
    await local().checkAll(Array.from({ length: 12 }, (_, index) => `${base}/${index}`))
    expect(peak).toBeLessThanOrEqual(LINK_CHECK_CONCURRENCY)
    expect(peak).toBeGreaterThan(1)
  })
})

describe('link check: logs', () => {
  it('never writes the address', async () => {
    const log = logger()
    const base = await serve(status(404))
    const secret = `${base}/receta-secreta-de-la-abuela`
    const check = createLinkCheck({ logger: log, addressAllowed: () => true })
    await check.checkAll([secret, 'http://127.0.0.1/otra-direccion-secreta', 'ftp://secreto.example/x'])
    const written = JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls])
    expect(written).not.toContain('secreta')
    expect(written).not.toContain('secreto')
  })
})
