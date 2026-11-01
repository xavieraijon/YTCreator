import {
  type ChannelInfo,
  SHORT_MAX_SECONDS,
  type VideoHit,
  type VideoInfo,
  isChannelId,
} from '@ytcreator/core'

// Maps yt-dlp's flat JSON (spike S1) to the port. A field that is missing or of another type is null.
type Json = Record<string, unknown>

const str = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 ? value : null)
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

// Flat listings only date a video when yt-dlp happens to have it; usually it is null.
function date(entry: Json): string | null {
  const timestamp = num(entry.timestamp) ?? num(entry.release_timestamp)
  if (timestamp !== null) return new Date(timestamp * 1000).toISOString()
  const day = str(entry.upload_date)
  return day && /^\d{8}$/.test(day) ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00.000Z` : null
}

export interface Listing {
  root: Json
  entries: Json[]
}

export function parseListing(stdout: string): Listing | null {
  try {
    const root = JSON.parse(stdout) as unknown
    if (!root || typeof root !== 'object' || Array.isArray(root)) return null
    const entries = (root as Json).entries
    return {
      root: root as Json,
      entries: Array.isArray(entries) ? entries.filter((e): e is Json => !!e && typeof e === 'object') : [],
    }
  } catch {
    return null
  }
}

export function toHits(listing: Listing): VideoHit[] {
  return listing.entries.flatMap((entry) => {
    const videoId = str(entry.id)
    const channelId = str(entry.channel_id)
    if (!videoId || !VIDEO_ID.test(videoId) || !channelId || !isChannelId(channelId)) return []
    return [
      {
        videoId,
        title: str(entry.title) ?? '',
        channelId,
        channelTitle: str(entry.channel) ?? str(entry.uploader) ?? '',
        views: num(entry.view_count),
        publishedAt: date(entry),
        durationSeconds: num(entry.duration),
      },
    ]
  })
}

export function toVideos(listing: Listing): VideoInfo[] {
  return listing.entries.flatMap((entry) => {
    const videoId = str(entry.id)
    if (!videoId || !VIDEO_ID.test(videoId)) return []
    const durationSeconds = num(entry.duration)
    return [
      {
        videoId,
        title: str(entry.title) ?? '',
        views: num(entry.view_count),
        durationSeconds,
        publishedAt: date(entry),
        isShort: durationSeconds !== null && durationSeconds <= SHORT_MAX_SECONDS,
      },
    ]
  })
}

export function toChannel(listing: Listing): ChannelInfo | null {
  const { root } = listing
  const channelId = str(root.channel_id)
  if (!channelId || !isChannelId(channelId)) return null
  const uploader = str(root.uploader_id)
  return {
    channelId,
    title: str(root.channel) ?? str(root.uploader) ?? '',
    handle: uploader?.startsWith('@') ? uploader.slice(1) : null,
    description: str(root.description) ?? '',
    subscribers: num(root.channel_follower_count),
    // Read with --playlist-end 1, the count would be of that one entry, not the channel's: better unknown.
    videoCount: null,
    country: null,
  }
}
