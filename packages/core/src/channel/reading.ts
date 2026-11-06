import { z } from 'zod'
import { bestVideos, type OwnBaselineSettings, type RatedVideo, worstVideos } from '../market/own-baseline.ts'
import { median } from '../market/stats.ts'

// What a reading of an existing channel sums up (FR-020, FR-020b). Only worked out from what was read: a figure that
// cannot be known is null (FR-009).
export const LOW_INFO_VIDEOS = 5
const LISTED = 3
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

const count = z.number().int().nonnegative()
const listedVideoSchema = z.object({
  videoId: z.string(),
  title: z.string(),
  views: count.nullable(),
  ratio: z.number().nonnegative(),
  publishedAt: z.string().nullable(),
})

const formatSummarySchema = z.object({
  count,
  medianViews: count.nullable(),
  averageDurationSeconds: count.nullable(),
  videosPerWeek: z.number().nonnegative().nullable(),
  // Only the newest videos have a date without a key: how many of `count` this is worked out from.
  datedVideos: count,
  best: z.array(listedVideoSchema),
  worst: z.array(listedVideoSchema),
})
export type FormatSummary = z.infer<typeof formatSummarySchema>

export const readingSummarySchema = z.object({
  videosRead: count,
  lowInfo: z.boolean(),
  // Part of it could not be read this time: some dates, or the Shorts.
  partial: z.boolean(),
  unknownFormat: count,
  long: formatSummarySchema,
  short: formatSummarySchema,
})
export type ReadingSummary = z.infer<typeof readingSummarySchema>

// Up to today: a channel that stopped publishing no longer publishes at the pace it had. Over at least a week: two
// videos published yesterday are not 14 a week.
function pace(dates: readonly number[], now: Date): number | null {
  if (dates.length < 2) return null
  const span = Math.max(now.getTime() - Math.min(...dates), WEEK_MS)
  return Math.round((dates.length / (span / WEEK_MS)) * 10) / 10
}

const toListed = ({ videoId, title, views, ratio, publishedAt }: RatedVideo & { ratio: number }) => ({
  videoId,
  title,
  views,
  ratio,
  publishedAt,
})

function summarizeFormat(
  videos: readonly RatedVideo[],
  {
    settings,
    now,
    undatedAreOld,
  }: { settings: Pick<OwnBaselineSettings, 'youngDays'>; now: Date; undatedAreOld: boolean },
): FormatSummary {
  const views = videos.flatMap((video) => (video.views === null ? [] : [video.views]))
  const durations = videos.flatMap((video) => (video.durationSeconds === null ? [] : [video.durationSeconds]))
  const dates = videos.flatMap((video) => (video.publishedAt === null ? [] : [Date.parse(video.publishedAt)]))
  const normal = median(views)
  const best = bestVideos(videos, LISTED)
  const chosen = new Set(best.map((video) => video.videoId))
  // Few videos could put one on both lists: it counts as what it is closer to, one of the best.
  const worst = worstVideos(
    videos.filter((video) => !chosen.has(video.videoId) && (video.publishedAt !== null || undatedAreOld)),
    LISTED,
    { settings, now },
  )
  return {
    count: videos.length,
    medianViews: normal === null ? null : Math.round(normal),
    averageDurationSeconds:
      durations.length === 0 ? null : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
    videosPerWeek: pace(dates, now),
    datedVideos: dates.length,
    best: best.map(toListed),
    worst: worst.map(toListed),
  }
}

export function summarizeReading(
  videos: readonly RatedVideo[],
  {
    settings,
    now,
    partial = false,
  }: { settings: Pick<OwnBaselineSettings, 'youngDays'>; now: Date; partial?: boolean },
): ReadingSummary {
  const long = videos.filter((video) => !video.isShort && video.durationSeconds !== null)
  const short = videos.filter((video) => video.isShort)
  // Only the newest have a date. One without it is older than those, which says it is not recent only if they reach
  // back far enough: otherwise it could be a video of last week, and those never count among the worst (FR-020b).
  const dates = videos.flatMap((video) => (video.publishedAt === null ? [] : [Date.parse(video.publishedAt)]))
  const since = now.getTime() - settings.youngDays * DAY_MS
  const undatedAreOld = dates.length > 0 && Math.min(...dates) < since
  const options = { settings, now, undatedAreOld }
  return {
    videosRead: videos.length,
    lowInfo: videos.length < LOW_INFO_VIDEOS,
    partial,
    unknownFormat: videos.length - long.length - short.length,
    long: summarizeFormat(long, options),
    short: summarizeFormat(short, options),
  }
}

const IMAGE_HOSTS = ['ggpht.com', 'googleusercontent.com']

// The only places a channel's image is loaded from: the page allows those and no others (Content-Security-Policy).
export function safeThumbnail(url: string | null): string | null {
  if (!url) return null
  try {
    const { protocol, hostname } = new URL(url)
    const known = IMAGE_HOSTS.some((host) => hostname.endsWith(`.${host}`))
    return protocol === 'https:' && known ? url : null
  } catch {
    return null
  }
}
