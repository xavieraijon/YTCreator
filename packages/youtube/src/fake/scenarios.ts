import type { ChannelInfo, VideoInfo } from '@ytcreator/core'
import { SHORT_MAX_SECONDS } from '@ytcreator/core'

// The fake's world (contracts/youtube-data.md, «fake»): a normal niche for any query, the «sin datos» and «bloqueado»
// niches, a channel of 30 videos and one of 3, and taken handles. Deterministic, with some fields null on purpose.

// Queries that contain these words give the matching failure.
export const EMPTY_QUERY_WORDS = ['sin datos', 'sin_datos']
export const BLOCKED_QUERY_WORDS = ['bloqueado']
// Handles that start like this are taken even if no fake channel uses them.
export const TAKEN_HANDLE_PREFIX = 'ocupad'

const BASE_DATE = Date.parse('2026-10-01T10:00:00Z')
const DAY_MS = 86_400_000
// Like the RSS feed: only the newest videos carry an exact date.
const DATED_VIDEOS = 15

export interface FakeChannel {
  info: ChannelInfo
  videos: VideoInfo[]
}

export const fakeChannelId = (slug: string): string => `UC${slug}${'0'.repeat(22)}`.slice(0, 24)
const fakeVideoId = (prefix: string, index: number): string =>
  `${prefix}v${String(index).padStart(3, '0')}`.padEnd(11, 'x').slice(0, 11)

function makeVideos(prefix: string, count: number, topic: string): VideoInfo[] {
  return Array.from({ length: count }, (_, i) => {
    const short = i % 4 === 1
    const durationSeconds = i % 11 === 10 ? null : short ? 45 : 420 + i * 13
    return {
      videoId: fakeVideoId(prefix, i),
      title: short ? `${topic}: un truco en un minuto (${i + 1})` : `${topic}: receta completa ${i + 1}`,
      views: i % 7 === 6 ? null : 900 + ((i * 7919) % 48_000),
      durationSeconds,
      publishedAt: i < DATED_VIDEOS ? new Date(BASE_DATE - i * 3 * DAY_MS).toISOString() : null,
      isShort: durationSeconds !== null && durationSeconds <= SHORT_MAX_SECONDS,
    }
  })
}

function makeChannel(slug: string, title: string, videoCount: number, extra: Partial<ChannelInfo> = {}): FakeChannel {
  // Two letters from each end keep the video ids of the fake channels apart.
  const videos = makeVideos(`${slug.slice(0, 2)}${slug.slice(-2)}`, videoCount, title)
  return {
    info: {
      channelId: fakeChannelId(slug),
      title,
      handle: slug,
      description: `Canal de prueba «${title}».`,
      subscribers: 1_000 + videoCount * 150,
      videoCount,
      country: 'ES',
      thumbnailUrl: null,
      ...extra,
    },
    videos,
  }
}

export const CHANNEL_30 = makeChannel('cocinacorta30', 'Cocina Corta', 30)
export const CHANNEL_3 = makeChannel('cocinatres', 'Cocina en Tres', 3, { subscribers: null, country: null })

// The channels a normal search finds videos from.
export const SEARCH_CHANNELS: FakeChannel[] = [
  CHANNEL_30,
  makeChannel('platodiario', 'Plato Diario', 12),
  makeChannel('fogonrapido', 'Fogón Rápido', 12),
  makeChannel('tupperfacil', 'Tupper Fácil', 12, { country: null }),
  makeChannel('recetaya', 'Receta Ya', 12),
  makeChannel('sartenlibre', 'Sartén Libre', 12, { subscribers: null }),
  makeChannel('menusemana', 'Menú de la Semana', 12),
  makeChannel('cenaexpres', 'Cena Exprés', 12),
]

export const FAKE_CHANNELS: FakeChannel[] = [...SEARCH_CHANNELS, CHANNEL_3]
