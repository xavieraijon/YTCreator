import type { ChannelInfo, VideoHit, VideoInfo } from '@ytcreator/core'
import { SHORT_MAX_SECONDS } from '@ytcreator/core'

// The fake's world (contracts/youtube-data.md, «fake»): a normal niche for any query, the «sin datos» and «bloqueado»
// niches (and one «sin lector»), a channel of 30 videos and one of 3, and taken handles. Deterministic, with some fields null on purpose.

// Queries that contain these words give the matching failure.
export const EMPTY_QUERY_WORDS = ['sin datos', 'sin_datos']
export const BLOCKED_QUERY_WORDS = ['bloqueado']
// As if the reader were not installed (quickstart §4, «Sin lector»).
export const NO_READER_QUERY_WORDS = ['sin lector']
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

// `@__PURE__`: unused (the published build has no fake YouTube), the bundler leaves these channels out (P6).
export const CHANNEL_30 = /* @__PURE__ */ makeChannel('cocinacorta30', 'Cocina Corta', 30)
export const CHANNEL_3 = /* @__PURE__ */ makeChannel('cocinatres', 'Cocina en Tres', 3, {
  subscribers: null,
  country: null,
})

// The channels a normal search finds videos from.
export const SEARCH_CHANNELS: FakeChannel[] = [
  CHANNEL_30,
  /* @__PURE__ */ makeChannel('platodiario', 'Plato Diario', 12),
  /* @__PURE__ */ makeChannel('fogonrapido', 'Fogón Rápido', 12),
  /* @__PURE__ */ makeChannel('tupperfacil', 'Tupper Fácil', 12, { country: null }),
  /* @__PURE__ */ makeChannel('recetaya', 'Receta Ya', 12),
  /* @__PURE__ */ makeChannel('sartenlibre', 'Sartén Libre', 12, { subscribers: null }),
  /* @__PURE__ */ makeChannel('menusemana', 'Menú de la Semana', 12),
  /* @__PURE__ */ makeChannel('cenaexpres', 'Cena Exprés', 12),
]

export const FAKE_CHANNELS: FakeChannel[] = /* @__PURE__ */ SEARCH_CHANNELS.concat(CHANNEL_3)

// The ideas of the bank (004, T034): a search that contains «idea <scenario>» gives that semaphore. The general topic
// has an audience if its search says «con publico», and the English search is an opportunity if it says
// «opportunity». «idea bloqueado» fails as any «bloqueado».
export const IDEA_SCENARIOS = {
  hueco: { similar: 3, recent: 1, views: 40_000 },
  competida: { similar: 14, recent: 1, views: 20_000 },
  quemada: { similar: 12, recent: 4, views: 20_000 },
  agotada: { similar: 14, recent: 0, views: 300 },
  fria: { similar: 2, recent: 0, views: 300 },
  oportunidad: { similar: 1, recent: 0, views: 2_000 },
} as const
export type IdeaScenario = keyof typeof IDEA_SCENARIOS
export const AUDIENCE_WORDS = 'con publico'
export const OPPORTUNITY_WORDS = 'opportunity'

const IDEA_RESULTS = 20
const BIG_VIEWS = [250_000, 180_000, 120_000]

const hitOf = (index: number, title: string, views: number, publishedAt: string | null): VideoHit => {
  const channel = SEARCH_CHANNELS[index % SEARCH_CHANNELS.length]!
  return {
    videoId: fakeVideoId('idea', index),
    title,
    channelId: channel.info.channelId,
    channelTitle: channel.info.title,
    views,
    publishedAt,
    durationSeconds: 600,
  }
}

const others = (from: number, views: number) =>
  Array.from({ length: IDEA_RESULTS - from }, (_, i) => hitOf(from + i, `Otro tema distinto ${i + 1}`, views, null))

// null when the search is not one of the idea scenarios: the normal niche answers it.
export function ideaSearch(text: string, now: Date): VideoHit[] | null {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString()
  if (text.includes(OPPORTUNITY_WORDS)) {
    return [...BIG_VIEWS.map((views, i) => hitOf(i, `English video ${i + 1}`, views, null)), ...others(3, 900)]
  }
  if (text.includes(AUDIENCE_WORDS)) {
    return [...BIG_VIEWS.map((views, i) => hitOf(i, `Tema general ${i + 1}`, views, null)), ...others(3, 900)]
  }
  const scenario = (Object.keys(IDEA_SCENARIOS) as IdeaScenario[]).find((key) => text.includes(`idea ${key}`))
  if (!scenario) return null
  const { similar, recent, views } = IDEA_SCENARIOS[scenario]
  const alike = Array.from({ length: similar }, (_, i) =>
    hitOf(i, `${text} (${i + 1})`, views + i * 10, i < recent ? daysAgo(5 + i) : daysAgo(200 + i)),
  )
  return [...alike, ...others(similar, 500)]
}
