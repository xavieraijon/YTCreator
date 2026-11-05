import { describe, expect, it } from 'vitest'
import { feedXml } from './feed-xml.ts'
import { feedFetch } from './youtube-fetch.ts'
import { classifyRun } from '../src/ytdlp/classify.ts'
import { HANDLE_TIMEOUT_MS, YTDLP_TIMEOUT_MS, createYtDlpYouTube } from '../src/ytdlp/adapter.ts'
import { INPUTS, runYouTubeContract } from './contract/battery.ts'
import { createFakeYtDlp } from './ytdlp-bin.ts'

const MISSING_BIN = '/nonexistent/ytcreator/bin/yt-dlp'

runYouTubeContract(
  'ytdlp',
  (stub) => {
    if (stub === 'no_disponible') return createYtDlpYouTube({ binPath: MISSING_BIN, fetch: feedFetch() })
    if (stub === 'tiempo_agotado') {
      const fake = createFakeYtDlp({ mode: 'hang' })
      return createYtDlpYouTube({ binPath: fake.bin, fetch: feedFetch(), timeouts: { processMs: 300 } })
    }
    return createYtDlpYouTube({ binPath: createFakeYtDlp().bin, fetch: feedFetch() })
  },
  { skip: { 'Y-cupo_agotado': 'yt-dlp no gasta cupo' } },
)

describe('yt-dlp adapter', () => {
  it('waits 45 s per process and 15 s per handle check by default', () => {
    expect(YTDLP_TIMEOUT_MS).toBe(45_000)
    expect(HANDLE_TIMEOUT_MS).toBe(15_000)
  })

  it('passes the arguments as a list, so the query is one argument and never goes through a shell', async () => {
    const fake = createFakeYtDlp()
    const yt = createYtDlpYouTube({ binPath: fake.bin, fetch: feedFetch() })
    const query = 'recetas"; rm -rf ~; echo "$(whoami)'
    await yt.search(query, { limit: 40 })
    const [argv] = fake.calls()
    expect(argv).toContain('--flat-playlist')
    expect(argv).toContain('-J')
    expect(argv).toContain('--ignore-config')
    expect(argv?.at(-1)).toBe(`ytsearch40:${query}`)
  })

  it('lists a channel with the limit and the /videos tab', async () => {
    const fake = createFakeYtDlp()
    const yt = createYtDlpYouTube({ binPath: fake.bin, fetch: feedFetch() })
    await yt.listChannelVideos(INPUTS.channelId, { limit: 30 })
    const [argv] = fake.calls()
    expect(argv?.slice(argv.indexOf('--playlist-end'), argv.indexOf('--playlist-end') + 2)).toEqual([
      '--playlist-end',
      '30',
    ])
    expect(argv?.at(-1)).toBe(`https://www.youtube.com/channel/${INPUTS.channelId}/videos`)
  })

  it('fills the dates of the newest videos from the RSS feed and leaves the rest null', async () => {
    const yt = createYtDlpYouTube({ binPath: createFakeYtDlp().bin, fetch: feedFetch() })
    const result = await yt.listChannelVideos(INPUTS.channelId, { limit: 200 })
    if (!result.ok) throw new Error(result.failure.code)
    expect(result.value.data).toHaveLength(30)
    expect(result.value.data.slice(0, 15).every((v) => v.publishedAt !== null)).toBe(true)
    expect(result.value.data.slice(15).every((v) => v.publishedAt === null)).toBe(true)
  })

  it('search hits take their date from the channel feed, and stay without one if it is not there (G2)', async () => {
    const published = '2026-10-20T10:00:00.000Z'
    const urls: string[] = []
    const feed = (async (input: string | URL | Request) => {
      urls.push(String(input))
      return new Response(feedXml([{ videoId: 'srch000xxxx', published }]))
    }) as typeof fetch
    const yt = createYtDlpYouTube({ binPath: createFakeYtDlp().bin, fetch: feed })
    const result = await yt.search(INPUTS.query, { limit: 40 })
    if (!result.ok) throw new Error(result.failure.code)
    const dated = result.value.data.filter((hit) => hit.publishedAt !== null)
    expect(dated.map((hit) => hit.videoId)).toEqual(['srch000xxxx'])
    expect(Date.parse(dated[0]!.publishedAt!)).toBe(Date.parse(published))
    expect(result.value.data.some((hit) => hit.views === null)).toBe(true)
    // One feed per channel, however many of its videos came up.
    expect(urls).toHaveLength(1)
  })

  it('a search still answers when the feed fails', async () => {
    const down = (async () => {
      throw new Error('sin red')
    }) as typeof fetch
    const yt = createYtDlpYouTube({ binPath: createFakeYtDlp().bin, fetch: down })
    const result = await yt.search(INPUTS.query, { limit: 40 })
    if (!result.ok) throw new Error(result.failure.code)
    expect(result.value.data.every((hit) => hit.publishedAt === null)).toBe(true)
  })

  it('is no_disponible without network', async () => {
    const yt = createYtDlpYouTube({ binPath: createFakeYtDlp({ mode: 'offline' }).bin, fetch: feedFetch() })
    const result = await yt.search(INPUTS.query, { limit: 40 })
    expect(!result.ok && result.failure.code).toBe('no_disponible')
  })

  it('is no_disponible when the binary is missing, and health says so', async () => {
    const yt = createYtDlpYouTube({ binPath: MISSING_BIN, fetch: feedFetch() })
    const result = await yt.search(INPUTS.query, { limit: 40 })
    expect(!result.ok && result.failure.code).toBe('no_disponible')
    expect(await yt.health()).toEqual({ source: 'ytdlp', available: false })
  })

  it('reports its version', async () => {
    const yt = createYtDlpYouTube({ binPath: createFakeYtDlp().bin, fetch: feedFetch() })
    expect(await yt.health()).toEqual({ source: 'ytdlp', available: true, version: '2026.08.19' })
  })

  it('checks a handle at its public URL and gives up after the handle timeout', async () => {
    const urls: string[] = []
    const yt = createYtDlpYouTube({
      binPath: MISSING_BIN,
      timeouts: { handleMs: 50 },
      fetch: ((url: string, init?: RequestInit) => {
        urls.push(url)
        return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
      }) as typeof fetch,
    })
    const result = await yt.checkHandle('nombrelibre2026')
    expect(urls).toEqual(['https://www.youtube.com/@nombrelibre2026'])
    expect(!result.ok && result.failure.code).toBe('tiempo_agotado')
  })

  it('a handle check that is neither 200 nor 404 is a failure, never a guess', async () => {
    const answer = (status: number) =>
      createYtDlpYouTube({ binPath: MISSING_BIN, fetch: (async () => new Response('', { status })) as typeof fetch })
    const blocked = await answer(429).checkHandle('algo')
    const broken = await answer(500).checkHandle('algo')
    expect(!blocked.ok && blocked.failure.code).toBe('bloqueado')
    expect(!broken.ok && broken.failure.code).toBe('no_disponible')
  })
})

describe('yt-dlp failure classification (S1)', () => {
  const run = (stderr: string) => classifyRun({ exitCode: 1, stdout: '', stderr, aborted: false })

  it('reads blocking, missing and no network from stderr', () => {
    expect(run('ERROR: [youtube:search] Unable to download API page: HTTP Error 429: Too Many Requests')).toBe(
      'bloqueado',
    )
    expect(run('ERROR: [youtube] abc: Sign in to confirm you’re not a bot')).toBe('bloqueado')
    expect(run('ERROR: [youtube:tab] x: HTTP Error 404: Not Found')).toBe('no_encontrado')
    expect(run('ERROR: Requested entity was not found')).toBe('no_encontrado')
    expect(
      run('ERROR: Unable to download API page: <urlopen error> (caused by Failed to establish a new connection)'),
    ).toBe('no_disponible')
    expect(run('ERROR: algo raro')).toBe('no_disponible')
  })

  it('a missing binary is no_disponible and a killed process is tiempo_agotado', () => {
    expect(classifyRun({ exitCode: null, stdout: '', stderr: '', spawnError: 'ENOENT', aborted: false })).toBe(
      'no_disponible',
    )
    expect(classifyRun({ exitCode: null, stdout: '', stderr: '', aborted: true })).toBe('tiempo_agotado')
    expect(classifyRun({ exitCode: 0, stdout: '{}', stderr: '', aborted: false })).toBeNull()
  })
})
