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

export const channelShortsArgs = (channelId: string, limit: number): string[] =>
  listingArgs(`https://www.youtube.com/channel/${channelId}/shorts`, limit)

export const channelPageArgs = (channelId: string): string[] =>
  listingArgs(`https://www.youtube.com/channel/${channelId}`, 1)

const handleUrl = (handle: string) => `https://www.youtube.com/@${encodeURIComponent(handle)}`

export const handleVideosArgs = (handle: string): string[] => listingArgs(`${handleUrl(handle)}/videos`, 1)

export const handleShortsArgs = (handle: string): string[] => listingArgs(`${handleUrl(handle)}/shorts`, 1)

export const handlePageArgs = (handle: string): string[] => listingArgs(handleUrl(handle), 1)

// The old /c/ and /user/ links: YouTube still answers them with the channel (T125b, entry 144).
const legacyUrl = (path: 'c' | 'user', name: string) => `https://www.youtube.com/${path}/${encodeURIComponent(name)}`

export const legacyVideosArgs = (path: 'c' | 'user', name: string): string[] =>
  listingArgs(`${legacyUrl(path, name)}/videos`, 1)

export const legacyPageArgs = (path: 'c' | 'user', name: string): string[] => listingArgs(legacyUrl(path, name), 1)

export const videoChannelArgs = (videoId: string): string[] => [
  ...BASE,
  '--skip-download',
  '--print',
  'channel_id',
  `https://www.youtube.com/watch?v=${videoId}`,
]
