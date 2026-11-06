import type { VideoInfo } from '../youtube/port.ts'
import { median } from './stats.ts'

const DAY_MS = 86_400_000

// `ownChannel` of thresholds.json (contracts/market.md).
export interface OwnBaselineSettings {
  baselineVideos: number
  minBaseline: number
  notableRatio: number
  youngDays: number
}

export type RatedVideo = VideoInfo & { ratio: number | null }

const formatOf = (video: VideoInfo): 'short' | 'largo' | null =>
  video.isShort ? 'short' : video.durationSeconds === null ? null : 'largo'

// How many times its channel's normal each video got: its views over the median of the previous uploads of the same
// format. `videos` go from newest to oldest, so this needs no dates. A video with too little before it gets null.
export function rateVideos(videos: readonly VideoInfo[], settings: OwnBaselineSettings): RatedVideo[] {
  return videos.map((video, index) => {
    const format = formatOf(video)
    if (format === null || video.views === null) return { ...video, ratio: null }
    const previous = videos
      .slice(index + 1)
      .filter((other) => formatOf(other) === format && other.views !== null)
      .slice(0, settings.baselineVideos)
      .map((other) => other.views!)
    if (previous.length < settings.minBaseline) return { ...video, ratio: null }
    const normal = median(previous)
    return { ...video, ratio: normal ? video.views / normal : null }
  })
}

export const isNotable = (video: RatedVideo, settings: Pick<OwnBaselineSettings, 'notableRatio'>) =>
  video.ratio !== null && video.ratio >= settings.notableRatio

type WithRatio = RatedVideo & { ratio: number }
const hasRatio = (video: RatedVideo): video is WithRatio => video.ratio !== null

export function bestVideos(videos: readonly RatedVideo[], count: number): WithRatio[] {
  return videos
    .filter(hasRatio)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, count)
}

// A recent video has not had time to gather views, so it never counts as bad. No date means old: the feed dates the
// newest ones.
export function worstVideos(
  videos: readonly RatedVideo[],
  count: number,
  { settings, now }: { settings: Pick<OwnBaselineSettings, 'youngDays'>; now: Date },
): WithRatio[] {
  const since = now.getTime() - settings.youngDays * DAY_MS
  return videos
    .filter(hasRatio)
    .filter((video) => video.publishedAt === null || Date.parse(video.publishedAt) < since)
    .sort((a, b) => a.ratio - b.ratio)
    .slice(0, count)
}

// The figures of a channel used as a reference: long videos only, as in the measures.
export function ownChannelFigures(videos: readonly VideoInfo[], settings: OwnBaselineSettings) {
  const long = videos.filter((video) => formatOf(video) === 'largo')
  const views = long.flatMap((video) => (video.views === null ? [] : [video.views]))
  const normal = median(views)
  const [best] = bestVideos(rateVideos(long, settings), 1)
  return {
    medianViews: normal === null ? null : Math.round(normal),
    bestRatio: best?.ratio ?? null,
    bestVideoId: best?.videoId ?? null,
    bestVideoTitle: best?.title ?? null,
  }
}
