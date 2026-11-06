import {
  channelsToAsk,
  type ChannelInfo,
  createLimiter,
  hasEnoughVideos,
  type MarketThresholds,
  measureNiche,
  mergeHits,
  type YouTubeData,
} from '@ytcreator/core'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createYtDlpYouTube } from '../src/ytdlp/adapter.ts'
import { runYtDlp } from '../src/ytdlp/process.ts'

// T125b: the real YouTube, through yt-dlp only (no key, no quota, no money). Outside CI: `pnpm test:real-youtube`,
// with the creator's approval. The reader is the one on the PATH unless YTCREATOR_YTDLP_BIN says another.
// What it finds is written in specs/003-channel-and-niche/checklists/validation.md.
const bin = process.env['YTCREATOR_YTDLP_BIN'] ?? 'yt-dlp'
const raw = createYtDlpYouTube({ binPath: bin, fetch: globalThis.fetch })

// As the app does (apps/server/src/services/youtube.ts): 3 yt-dlp processes and 4 checks of a @ at once.
const processes = createLimiter(3)
const handles = createLimiter(4)
const youtube: Pick<YouTubeData, 'search' | 'getChannel' | 'listChannelVideos' | 'checkHandle' | 'resolve'> = {
  search: (query, options) => processes(() => raw.search(query, options)),
  getChannel: (ref, signal) => processes(() => raw.getChannel(ref, signal)),
  listChannelVideos: (channelId, options) => processes(() => raw.listChannelVideos(channelId, options)),
  checkHandle: (handle, signal) => handles(() => raw.checkHandle(handle, signal)),
  resolve: (input, signal) => processes(() => raw.resolve(input, signal)),
}

const thresholds = (
  JSON.parse(readFileSync(new URL('../../knowledge/market/thresholds.json', import.meta.url), 'utf8')) as {
    data: MarketThresholds
  }
).data

const seconds = (since: number) => Math.round((performance.now() - since) / 100) / 10
const report: Record<string, unknown> = {}

// One niche as niche-research measures it: its searches, the channels behind them, and the figures.
async function measure(queries: readonly string[]) {
  const results = await Promise.all(queries.map((query) => youtube.search(query, { limit: 40 })))
  const hits = mergeHits(results.flatMap((result) => (result.ok ? [result.value.data] : [])))
  if (!hasEnoughVideos(hits, thresholds)) return { failures: results.filter((r) => !r.ok).length, figures: null }
  const channels = new Map<string, ChannelInfo>()
  const asked = await Promise.all(channelsToAsk(hits, thresholds).map((channelId) => youtube.getChannel({ channelId })))
  for (const result of asked) if (result.ok) channels.set(result.value.data.channelId, result.value.data)
  return { failures: 0, figures: measureNiche({ hits, channels, thresholds, now: new Date() }) }
}

describe('the real YouTube through yt-dlp (T125b)', () => {
  it('the reader answers', async () => {
    const version = await runYtDlp(bin, ['--version'])
    expect(version.exitCode).toBe(0)
    report['yt-dlp'] = version.stdout.trim()
  })

  it('10 @ known to be taken come out taken (SC-004)', async () => {
    const taken = [
      'MrBeast',
      'mkbhd',
      'veritasium',
      'kurzgesagt',
      'TED',
      'NASA',
      'elrubiusOMG',
      'ibai',
      'Vegetta777',
      'auronplay',
    ]
    const start = performance.now()
    const results = await Promise.all(taken.map((handle) => youtube.checkHandle(handle)))
    report['SC-004'] = { seconds: seconds(start), statuses: results.map((r) => (r.ok ? r.value.data : r.failure.code)) }
    expect(results.map((r) => (r.ok ? r.value.data : r.failure.code))).toEqual(taken.map(() => 'ocupado'))
  })

  it('measuring 5 niches takes less than 2 minutes (SC-003)', async () => {
    const niches = [
      ['recetas rápidas', 'cenas fáciles'],
      ['ahorrar dinero', 'finanzas personales'],
      ['huerto urbano', 'plantas de interior'],
      ['aprender python', 'programación desde cero'],
      ['viajar barato', 'viajes low cost'],
    ]
    const start = performance.now()
    const measured = await Promise.all(niches.map((queries) => measure(queries)))
    const took = seconds(start)
    report['SC-003'] = {
      seconds: took,
      verdicts: measured.map(({ figures }) => figures?.verdict ?? 'sin cifras'),
      medians: measured.map(({ figures }) => figures?.demandMedianViews ?? null),
    }
    expect(took).toBeLessThan(120)
    expect(measured.filter(({ figures }) => figures !== null).length).toBeGreaterThanOrEqual(4)
  }, 180_000)

  it('reading a channel takes less than 1 minute, Shorts included (SC-005, entries 56 and 57)', async () => {
    const start = performance.now()
    const ref = await youtube.resolve('@veritasium')
    expect(ref.ok).toBe(true)
    if (!ref.ok) return
    const [info, videos] = await Promise.all([
      youtube.getChannel(ref.value.data),
      youtube.listChannelVideos(ref.value.data.channelId, { limit: 200, withShorts: true }),
    ])
    const took = seconds(start)
    expect(info.ok && videos.ok).toBe(true)
    if (!info.ok || !videos.ok) return
    const thumbnail = info.value.data.thumbnailUrl ? new URL(info.value.data.thumbnailUrl).hostname : null
    report['SC-005'] = {
      seconds: took,
      videos: videos.value.data.length,
      shorts: videos.value.data.filter((v) => v.isShort).length,
      withDate: videos.value.data.filter((v) => v.publishedAt !== null).length,
      partial: videos.value.partial === true,
      thumbnailHost: thumbnail,
    }
    expect(took).toBeLessThan(60)
    expect(videos.value.data.some((video) => video.isShort)).toBe(true)
    expect(thumbnail === null || /(^|\.)(ggpht|googleusercontent)\.com$/.test(thumbnail)).toBe(true)
  }, 120_000)

  it('a big channel: its Shorts and its videos, within the time (entry 57)', async () => {
    const start = performance.now()
    const ref = await youtube.resolve('@MrBeast')
    expect(ref.ok).toBe(true)
    if (!ref.ok) return
    const videos = await youtube.listChannelVideos(ref.value.data.channelId, { limit: 200, withShorts: true })
    const took = seconds(start)
    expect(videos.ok).toBe(true)
    if (!videos.ok) return
    report['entry 57'] = {
      seconds: took,
      videos: videos.value.data.length,
      shorts: videos.value.data.filter((v) => v.isShort).length,
      partial: videos.value.partial === true,
    }
    expect(took).toBeLessThan(60)
    expect(videos.value.data.filter((v) => v.isShort).length).toBeGreaterThan(0)
    expect(videos.value.data.filter((v) => !v.isShort).length).toBeGreaterThan(0)
  }, 120_000)

  // The old addresses (entries 88 and 144), as the app reads them now, and a @ with ñ (entry 84).
  it('the old /user/ and /c/ addresses lead to the channel (FR-019, entries 88 and 144)', async () => {
    const urls = ['https://www.youtube.com/user/Vsauce/videos', 'https://www.youtube.com/c/veritasium/videos']
    const ids = await Promise.all(
      urls.map(async (url) => {
        const result = await youtube.resolve(url)
        return result.ok ? result.value.data.channelId : `fallo ${result.failure.code}`
      }),
    )
    report['entry 88'] = Object.fromEntries(urls.map((url, i) => [url, ids[i]]))
    for (const id of ids) expect(id).toMatch(/^UC[\w-]{22}$/)
  }, 120_000)

  it('a @ with ñ is read as it is written (entry 84)', async () => {
    // `@niños` exists (its page answers 200); `@españa` does not.
    const result = await youtube.resolve('@niños')
    report['entry 84'] = result.ok ? result.value.data.channelId : result.failure.code
    expect(result.ok && result.value.data.channelId).toMatch(/^UC[\w-]{22}$/)
  }, 60_000)

  it('writes what it found', () => {
    const found = `T125b ${new Date().toISOString()}\n${JSON.stringify(report, null, 2)}\n`
    const file = process.env['YTCREATOR_REAL_REPORT']
    if (file) writeFileSync(file, found)
    console.log(found)
  })
})
