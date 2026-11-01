// The argument lists yt-dlp is called with. `--ignore-config` keeps the creator's own yt-dlp config out of it.
const BASE = ['--ignore-config']

export const versionArgs = (): string[] => ['--version']

export const searchArgs = (query: string, limit: number): string[] => [
  ...BASE,
  '--flat-playlist',
  '-J',
  `ytsearch${limit}:${query}`,
]

const listingArgs = (url: string, limit: number): string[] => [
  ...BASE,
  '--flat-playlist',
  '-J',
  '--playlist-end',
  String(limit),
  url,
]

export const channelVideosArgs = (channelId: string, limit: number): string[] =>
  listingArgs(`https://www.youtube.com/channel/${channelId}/videos`, limit)

export const handleVideosArgs = (handle: string): string[] =>
  listingArgs(`https://www.youtube.com/@${encodeURIComponent(handle)}/videos`, 1)

export const videoChannelArgs = (videoId: string): string[] => [
  ...BASE,
  '--skip-download',
  '--print',
  'channel_id',
  `https://www.youtube.com/watch?v=${videoId}`,
]
