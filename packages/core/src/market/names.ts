import type { NameReason, Semaphore, StoredHandleStatus } from '../channel/model.ts'
import type { VideoHit } from '../youtube/port.ts'

// The traffic light of a name (FR-017, data-model.md). A fixed rule; the AI does not take part.
export interface NameThresholds {
  titleHits: number
  maxLength: number
}

const MAX_SIMILAR = 5
const MIN_CONTAINED = 4

export const normalizeName = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i]
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    row = next
  }
  return row[b.length]!
}

const isSimilar = (name: string, other: string) => {
  const contained = (small: string, big: string) => small.length >= MIN_CONTAINED && big.includes(small)
  return contained(name, other) || contained(other, name) || (name.length >= 5 && distance(name, other) <= 2)
}

export interface NameFindings {
  sameName: boolean
  similarChannels: { title: string; handle: null; subscribers: null }[]
  titleHits: number
}

// What a search says about a name: channels called the same or nearly, and videos with it in the title.
export function nameFindings(displayName: string, hits: readonly VideoHit[]): NameFindings {
  const name = normalizeName(displayName)
  const titles = new Map(hits.map((hit) => [hit.channelId, hit.channelTitle]))
  const others = [...titles.values()].filter((title) => normalizeName(title) !== name)
  return {
    sameName: [...titles.values()].some((title) => normalizeName(title) === name),
    similarChannels: others
      .filter((title) => isSimilar(name, normalizeName(title)))
      .slice(0, MAX_SIMILAR)
      .map((title) => ({ title, handle: null, subscribers: null })),
    titleHits: hits.filter((hit) => normalizeName(hit.title).includes(name)).length,
  }
}

export interface NameCheckInput {
  displayName: string
  handleStatus: StoredHandleStatus
  /** Null when the search failed. */
  findings: NameFindings | null
}

export function semaphoreOf(
  { displayName, handleStatus, findings }: NameCheckInput,
  thresholds: NameThresholds,
): { semaphore: Semaphore; reasons: NameReason[] } {
  const reasons: NameReason[] = []
  if (handleStatus === 'ocupado') reasons.push('handle_ocupado')
  if (findings?.sameName) reasons.push('nombre_igual')
  if (findings && findings.similarChannels.length > 0) reasons.push('parecidos')
  if (findings && findings.titleHits >= thresholds.titleHits) reasons.push('titulos_con_nombre')
  if ([...displayName.trim()].length > thresholds.maxLength) reasons.push('largo')

  // Any part left unchecked is never green, whatever the other part said (T092).
  if (handleStatus === 'sin_comprobar' || !findings)
    return { semaphore: 'sin_comprobar', reasons: [...reasons, 'fallo'] }
  if (reasons.includes('handle_ocupado') || reasons.includes('nombre_igual')) return { semaphore: 'rojo', reasons }
  return { semaphore: reasons.length > 0 ? 'ambar' : 'verde', reasons }
}
