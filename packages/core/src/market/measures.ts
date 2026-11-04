import type { EntryLevel, Level, Verdict } from '../channel/model.ts'
import { type ChannelInfo, SHORT_MAX_SECONDS, type VideoHit } from '../youtube/port.ts'
import { median } from './stats.ts'
import { verdictOf } from './verdict.ts'

const DAY_MS = 86_400_000

// The part of thresholds.json the measures read (contracts/market.md).
export interface MarketThresholds {
  demand: { high: number; medium: number }
  entryDoor: { open: number; ajar: number; maxSubscribers: number }
  concentration: { high: number; medium: number; topChannels: number }
  minVideos: number
  maxChannels: number
  saturationDays: number
  context: { smallChannelSubscribers: number }
}

export interface MeasureFigures {
  demandMedianViews: number
  demandLevel: Level
  entryChannels: number
  entryLevel: EntryLevel
  concentration: number
  concentrationLevel: Level
  // Null when no video of the sample has a date: never estimated.
  recentVideos: number | null
  recentShare: number | null
  sampleSize: number
  shortsInSample: number
  shortsMedianViews: number | null
  unknownFormatVideos: number
  smallChannels: number
  hiddenSubscribers: number
  verdict: Verdict
}

type LongHit = VideoHit & { views: number }

export function mergeHits(lists: readonly (readonly VideoHit[])[]): VideoHit[] {
  const seen = new Map<string, VideoHit>()
  for (const hit of lists.flat()) if (!seen.has(hit.videoId)) seen.set(hit.videoId, hit)
  return [...seen.values()]
}

const isLong = (hit: VideoHit) => hit.durationSeconds !== null && hit.durationSeconds > SHORT_MAX_SECONDS
const isShort = (hit: VideoHit) => hit.durationSeconds !== null && hit.durationSeconds <= SHORT_MAX_SECONDS

// Only long videos with views count (FR-007b): the main format, and a Short's views are not comparable.
export const longHits = (hits: readonly VideoHit[]): LongHit[] =>
  hits.filter((hit): hit is LongHit => isLong(hit) && hit.views !== null)

export const hasEnoughVideos = (hits: readonly VideoHit[], thresholds: Pick<MarketThresholds, 'minVideos'>) =>
  longHits(hits).length >= thresholds.minVideos

function viewsByChannel(long: readonly LongHit[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const hit of long) totals.set(hit.channelId, (totals.get(hit.channelId) ?? 0) + hit.views)
  return totals
}

// Which channels to ask for their subscribers: those with most views, up to the limit.
export function channelsToAsk(hits: readonly VideoHit[], thresholds: Pick<MarketThresholds, 'maxChannels'>): string[] {
  return [...viewsByChannel(longHits(hits))]
    .sort((a, b) => b[1] - a[1])
    .slice(0, thresholds.maxChannels)
    .map(([channelId]) => channelId)
}

const levelOf = (value: number, { high, medium }: { high: number; medium: number }): Level =>
  value >= high ? 'alta' : value >= medium ? 'media' : 'baja'

export interface MeasureInput {
  hits: readonly VideoHit[]
  channels: ReadonlyMap<string, ChannelInfo>
  thresholds: MarketThresholds
  now: Date
}

// Pure: the figures come from here and the AI only comments on them (principle II). Null means too few videos.
export function measureNiche({ hits, channels, thresholds, now }: MeasureInput): MeasureFigures | null {
  const long = longHits(hits)
  if (long.length < thresholds.minVideos) return null

  const demandMedianViews = Math.round(median(long.map((hit) => hit.views))!)
  const demandLevel = levelOf(demandMedianViews, thresholds.demand)

  // Entry door: channels under the limit with a video that has at least as many views as they have subscribers.
  const bestViews = new Map<string, number>()
  for (const hit of long) bestViews.set(hit.channelId, Math.max(bestViews.get(hit.channelId) ?? 0, hit.views))
  let entryChannels = 0
  let smallChannels = 0
  let hiddenSubscribers = 0
  for (const [channelId, views] of bestViews) {
    const subscribers = channels.get(channelId)?.subscribers ?? null
    if (subscribers === null) {
      hiddenSubscribers += 1
      continue
    }
    if (subscribers < thresholds.context.smallChannelSubscribers) smallChannels += 1
    if (subscribers < thresholds.entryDoor.maxSubscribers && views >= subscribers) entryChannels += 1
  }
  const entryLevel: EntryLevel =
    entryChannels >= thresholds.entryDoor.open
      ? 'abierta'
      : entryChannels >= thresholds.entryDoor.ajar
        ? 'entreabierta'
        : 'cerrada'

  const totals = [...viewsByChannel(long).values()].sort((a, b) => b - a)
  const allViews = totals.reduce((sum, views) => sum + views, 0)
  const topViews = totals.slice(0, thresholds.concentration.topChannels).reduce((sum, views) => sum + views, 0)
  const concentration = allViews === 0 ? 0 : topViews / allViews
  const concentrationLevel = levelOf(concentration, thresholds.concentration)

  const dated = long.filter((hit) => hit.publishedAt !== null)
  const since = now.getTime() - thresholds.saturationDays * DAY_MS
  const recentVideos = dated.length === 0 ? null : dated.filter((hit) => Date.parse(hit.publishedAt!) >= since).length
  const recentShare = recentVideos === null ? null : recentVideos / dated.length

  const shorts = hits.filter(isShort)
  const shortViews = shorts.flatMap((hit) => (hit.views === null ? [] : [hit.views]))
  const shortsMedian = shortViews.length >= thresholds.minVideos ? median(shortViews) : null

  return {
    demandMedianViews,
    demandLevel,
    entryChannels,
    entryLevel,
    concentration,
    concentrationLevel,
    recentVideos,
    recentShare,
    sampleSize: long.length,
    shortsInSample: shorts.length,
    shortsMedianViews: shortsMedian === null ? null : Math.round(shortsMedian),
    unknownFormatVideos: hits.filter((hit) => hit.durationSeconds === null).length,
    smallChannels,
    hiddenSubscribers,
    verdict: verdictOf({ demandLevel, entryLevel, concentrationLevel }).verdict,
  }
}

export const REFERENCE_REASONS = ['puerta_de_entrada', 'mejor_video', 'anadido_por_ti'] as const
export type ReferenceReason = (typeof REFERENCE_REASONS)[number]

export interface ReferenceCandidate {
  channel: ChannelInfo
  topVideoViews: number
  reason: ReferenceReason
}

// First those that count for the entry door, then by the views of their best video (FR-012).
export function pickReferences(
  hits: readonly VideoHit[],
  channels: ReadonlyMap<string, ChannelInfo>,
  thresholds: Pick<MarketThresholds, 'entryDoor'> & { references: { max: number } },
): ReferenceCandidate[] {
  const best = new Map<string, number>()
  for (const hit of longHits(hits)) best.set(hit.channelId, Math.max(best.get(hit.channelId) ?? 0, hit.views))
  const candidates = [...best].flatMap(([channelId, topVideoViews]): ReferenceCandidate[] => {
    const channel = channels.get(channelId)
    if (!channel) return []
    const { subscribers } = channel
    const opens =
      subscribers !== null && subscribers < thresholds.entryDoor.maxSubscribers && topVideoViews >= subscribers
    return [{ channel, topVideoViews, reason: opens ? 'puerta_de_entrada' : 'mejor_video' }]
  })
  const rank = (c: ReferenceCandidate) => (c.reason === 'puerta_de_entrada' ? 0 : 1)
  return candidates
    .sort((a, b) => rank(a) - rank(b) || b.topVideoViews - a.topVideoViews)
    .slice(0, thresholds.references.max)
}
