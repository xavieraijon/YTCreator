import type { FactLabel, FactOrigin, LinkState } from './model.ts'

// What the app decides on its own: the AI cannot vouch for itself (R8, SC-010).

const TWO_LEVEL_SUFFIXES = new Set(['ac', 'co', 'com', 'edu', 'gob', 'gov', 'net', 'ne', 'or', 'org'])
const SUFFIX_COUNTRY = /^[a-z]{2}$/

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }
}

// Without a public suffix list: `a.co.uk` is its own domain, and so is `a.com.es` (decision 32).
export function domainOf(url: string): string | null {
  const host = hostOf(url)
  if (host === null) return null
  const labels = host.split('.')
  if (labels.length <= 2) return host
  const [second, last] = labels.slice(-2) as [string, string]
  const keep = SUFFIX_COUNTRY.test(last) && TWO_LEVEL_SUFFIXES.has(second) ? 3 : 2
  return labels.slice(-keep).join('.')
}

function isUnreliable(url: string, unreliableDomains: readonly string[]): boolean {
  const host = hostOf(url)
  if (host === null) return true
  return unreliableDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

export interface FactLabelInput {
  proposed: FactLabel
  origin: FactOrigin
  sources: readonly { url: string | null; link: LinkState | null }[]
  alternatives?: string | null
}

const BACKED_LABELS: readonly FactLabel[] = ['sin_confirmar', 'una_fuente', 'comprobado']

// How many independent, reliable sites whose link opens stand behind something (FR-004c).
export function backingDomains(sources: FactLabelInput['sources'], unreliableDomains: readonly string[]): number {
  const domains = new Set<string>()
  for (const { url, link } of sources) {
    if (url === null || link !== 'abre' || isUnreliable(url, unreliableDomains)) continue
    const domain = domainOf(url)
    if (domain !== null) domains.add(domain)
  }
  return domains.size
}

export function factLabel(fact: FactLabelInput, unreliableDomains: readonly string[]): FactLabel {
  if (fact.origin === 'creador') return 'del_creador'
  // Sources that disagree: nothing is confirmed, however many there are (spec, Edge Cases).
  if (fact.alternatives) return 'sin_confirmar'
  const earned = BACKED_LABELS[Math.min(backingDomains(fact.sources, unreliableDomains), 2)] as FactLabel
  const proposed = BACKED_LABELS.indexOf(fact.proposed)
  return proposed === -1 || proposed > BACKED_LABELS.indexOf(earned) ? earned : fact.proposed
}

function comparable(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`
  } catch {
    return url
  }
}

// An address the provider never saw is an invented one. Providers that do not report them keep everything.
export function seenSources<S extends { url: string | null }>(
  sources: readonly S[],
  seenUrls?: readonly string[],
): S[] {
  if (seenUrls === undefined) return [...sources]
  const seen = new Set(seenUrls.map(comparable))
  return sources.filter((source) => source.url !== null && seen.has(comparable(source.url)))
}
