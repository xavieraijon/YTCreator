import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns'
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { BlockList, isIP } from 'node:net'
import { createLimiter, type LinkState, type Logger } from '@ytcreator/core'

// Does a link open? Only 2xx backs a fact (R7, FR-004c). The addresses come from the internet by way of the AI,
// so this is the one place that must never be pointed at the creator's own network.

export const LINK_CHECK_TIMEOUT_MS = 8000
export const LINK_CHECK_CONCURRENCY = 5
export const LINK_CHECK_TOTAL_MS = 60_000 // what is left when it runs out stays «sin comprobar»
const MAX_REDIRECTS = 3
const REDIRECTS = new Set([301, 302, 303, 307, 308])
const GONE = new Set([404, 410])
const UNCERTAIN_ERRORS = new Set(['EAI_AGAIN', 'ETIMEDOUT'])

const notPublic = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3], // multicast and reserved
] as const) {
  notPublic.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
  // Forms of IPv6 that carry an IPv4 inside. `::ffff:0:0/96` needs no line: BlockList checks it against the IPv4 rules.
  ['::', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['2001::', 32],
  ['2002::', 16],
] as const) {
  notPublic.addSubnet(network, prefix, 'ipv6')
}

export function isPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 0) return false
  return !notPublic.check(address, version === 6 ? 'ipv6' : 'ipv4')
}

class RefusedAddress extends Error {}

type Lookup = typeof dnsLookup

export interface LinkCheckDeps {
  logger: Logger
  lookup?: Lookup
  timeoutMs?: number
  totalMs?: number
  // Only the tests of this file replace it, to talk to their own local server.
  addressAllowed?: (address: string) => boolean
}

export interface LinkCheck {
  check(url: string, signal?: AbortSignal): Promise<LinkState>
  checkAll(urls: readonly string[], signal?: AbortSignal): Promise<Map<string, LinkState>>
}

function parseHttp(url: string, base?: URL): URL | null {
  try {
    const parsed = new URL(url, base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.username !== '' || parsed.password !== '') return null
    return parsed
  } catch {
    return null
  }
}

const unbracketed = (host: string) => host.replace(/^\[|\]$/g, '')

export function createLinkCheck({
  logger,
  lookup = dnsLookup,
  timeoutMs = LINK_CHECK_TIMEOUT_MS,
  totalMs = LINK_CHECK_TOTAL_MS,
  addressAllowed = isPublicAddress,
}: LinkCheckDeps): LinkCheck {
  const limit = createLimiter(LINK_CHECK_CONCURRENCY)

  // Checked here, on the address about to be used, so a DNS change after a first look does not help.
  const safeLookup = ((hostname: string, options: LookupOptions, done: (...args: unknown[]) => void) => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return done(error)
      const found = addresses as LookupAddress[]
      if (found.length === 0 || found.some(({ address }) => !addressAllowed(address))) {
        return done(new RefusedAddress())
      }
      if (options.all) return done(null, found)
      const [first] = found as [LookupAddress]
      done(null, first.address, first.family)
    })
  }) as Lookup

  const fetchHead = (target: URL, signal: AbortSignal) =>
    new Promise<IncomingMessage>((resolve, reject) => {
      const send = target.protocol === 'https:' ? httpsRequest : httpRequest
      const request: ClientRequest = send(target, {
        method: 'GET',
        agent: false,
        lookup: safeLookup,
        signal,
        headers: { accept: '*/*', 'user-agent': 'YTCreator-link-check' },
      })
      request.on('response', resolve)
      request.on('error', reject)
      request.end()
    })

  const follow = async (start: URL, signal: AbortSignal): Promise<LinkState> => {
    let target = start
    for (let redirects = 0; ; redirects += 1) {
      // Node does not call `lookup` when the host is already an IP.
      const host = unbracketed(target.hostname)
      if (isIP(host) !== 0 && !addressAllowed(host)) return 'no_abre'
      const response = await fetchHead(target, signal)
      const code = response.statusCode ?? 0
      const location = response.headers.location
      response.destroy()
      if (code >= 200 && code < 300) return 'abre'
      if (GONE.has(code)) return 'no_abre'
      if (!REDIRECTS.has(code) || location === undefined) return 'sin_comprobar'
      if (redirects === MAX_REDIRECTS) return 'sin_comprobar'
      const next = parseHttp(location, target)
      if (next === null) return 'no_abre'
      target = next
    }
  }

  const check = async (url: string, signal?: AbortSignal): Promise<LinkState> => {
    const start = parseHttp(url)
    if (start === null) return 'no_abre'
    const time = AbortSignal.timeout(timeoutMs)
    try {
      return await follow(start, signal ? AbortSignal.any([signal, time]) : time)
    } catch (error) {
      if (error instanceof RefusedAddress) return 'no_abre'
      const { name, code } = error as NodeJS.ErrnoException
      return name === 'AbortError' || name === 'TimeoutError' || UNCERTAIN_ERRORS.has(code ?? '')
        ? 'sin_comprobar'
        : 'no_abre'
    }
  }

  return {
    check,
    async checkAll(urls, signal) {
      const unique = [...new Set(urls)]
      const total = AbortSignal.timeout(totalMs)
      const end = signal ? AbortSignal.any([signal, total]) : total
      const states = await Promise.all(unique.map((url) => limit(() => check(url, end))))
      const opened = states.filter((state) => state === 'abre').length
      // Counts only: an address says what the creator is researching.
      logger.info('link_check', { checked: unique.length, opened })
      return new Map(unique.map((url, index) => [url, states[index] as LinkState]))
    },
  }
}
