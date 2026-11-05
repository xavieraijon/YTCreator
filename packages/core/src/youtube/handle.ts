// What the creator can paste to point at a channel (FR-019): a channel link, @handle, handle, a video link or a
// /channel/UC… link. Anything else is null.
export type ChannelInput =
  { kind: 'handle'; handle: string } | { kind: 'channel'; channelId: string } | { kind: 'video'; videoId: string }

const HANDLE = /^[A-Za-z0-9._-]{3,30}$/
// The @ of a channel that already exists: YouTube admits letters of any language. The ones the AI proposes or the
// creator writes are the plain ones of HANDLE_PATTERN (decisions.md, entry 84).
export const CHANNEL_HANDLE_PATTERN = /^[\p{L}\p{M}\p{N}._·-]{3,30}$/u
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])

export const isValidHandle = (value: string): boolean => HANDLE.test(value)
export const isChannelId = (value: string): boolean => CHANNEL_ID.test(value)

const toUrl = (text: string): URL | null => {
  try {
    return new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
}

const decoded = (text: string): string | null => {
  try {
    return decodeURIComponent(text)
  } catch {
    return null
  }
}

export function parseChannelInput(raw: string): ChannelInput | null {
  const text = raw.trim()
  if (!text) return null
  if (isChannelId(text)) return { kind: 'channel', channelId: text }
  if (!text.includes('/') && !text.includes('.youtube') && !/\s/.test(text)) {
    const handle = text.startsWith('@') ? text.slice(1) : text
    return CHANNEL_HANDLE_PATTERN.test(handle) ? { kind: 'handle', handle } : null
  }

  const url = toUrl(text)
  if (!url) return null
  const host = url.hostname.toLowerCase()
  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? ''
    return VIDEO_ID.test(id) ? { kind: 'video', videoId: id } : null
  }
  if (!YOUTUBE_HOSTS.has(host)) return null

  const [first = '', second = ''] = url.pathname.split('/').filter(Boolean)
  if (first.startsWith('@')) {
    const handle = decoded(first.slice(1))
    return handle !== null && CHANNEL_HANDLE_PATTERN.test(handle) ? { kind: 'handle', handle } : null
  }
  if (first === 'channel') return isChannelId(second) ? { kind: 'channel', channelId: second } : null
  if (first === 'watch') {
    const id = url.searchParams.get('v') ?? ''
    return VIDEO_ID.test(id) ? { kind: 'video', videoId: id } : null
  }
  if (first === 'shorts' || first === 'live') return VIDEO_ID.test(second) ? { kind: 'video', videoId: second } : null
  return null
}
