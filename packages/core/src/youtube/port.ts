import type { YouTubeResult } from './failures.ts'

// Port the domain uses to read YouTube (contracts/youtube-data.md). A field that could not be read is null:
// the port never fills in or estimates (FR-009).
export const YOUTUBE_SOURCES = ['ytdlp', 'data_api', 'fake'] as const
export type YouTubeSource = (typeof YOUTUBE_SOURCES)[number]

// Every value carries where and when it was read, so the interface can cite it (FR-008).
export interface Sourced<T> {
  data: T
  source: YouTubeSource
  fetchedAt: string // ISO 8601 UTC
}

export interface ChannelRef {
  channelId: string // always UC…
}

export interface VideoHit {
  videoId: string
  title: string
  channelId: string
  channelTitle: string
  views: number | null
  publishedAt: string | null
  durationSeconds: number | null
}

export interface ChannelInfo {
  channelId: string
  title: string
  handle: string | null
  description: string
  subscribers: number | null
  videoCount: number | null
  country: string | null
}

export interface VideoInfo {
  videoId: string
  title: string
  views: number | null
  durationSeconds: number | null
  publishedAt: string | null
  isShort: boolean
}

export type HandleStatus = 'libre' | 'ocupado'

export interface YouTubeHealth {
  source: YouTubeSource
  available: boolean
  version?: string
  quota?: { used: number; limit: number; nearLimit: boolean }
}

export const SEARCH_LIMIT = 40
export const CHANNEL_VIDEOS_LIMIT = 200
export const SHORT_MAX_SECONDS = 180

export interface YouTubeData {
  readonly source: YouTubeSource
  search(query: string, options: { limit: number; signal?: AbortSignal }): Promise<YouTubeResult<Sourced<VideoHit[]>>>
  getChannel(ref: ChannelRef, signal?: AbortSignal): Promise<YouTubeResult<Sourced<ChannelInfo>>>
  listChannelVideos(
    channelId: string,
    options: { limit: number; signal?: AbortSignal },
  ): Promise<YouTubeResult<Sourced<VideoInfo[]>>>
  checkHandle(handle: string, signal?: AbortSignal): Promise<YouTubeResult<Sourced<HandleStatus>>>
  resolve(input: string, signal?: AbortSignal): Promise<YouTubeResult<Sourced<ChannelRef>>>
  health(): Promise<YouTubeHealth>
}
