import { describe, expect, it } from 'vitest'
import type { ChannelReadingView, MeasureView, ReferenceChannelView } from '../../src/api/channel.ts'
import { EXPORT_SECTIONS, exportFileName, profileJson, profileMarkdown } from '../../src/channel/export.ts'
import { channelProfileSchema, type ChannelProfile } from '../../src/channel/profile.ts'

const pillar = (n: number) => ({ title: `Tema ${n}`, description: `Qué entra en el tema ${n}.` })

const profile: ChannelProfile = channelProfileSchema.parse({
  schemaVersion: 1,
  niche: { label: 'Cocina fácil', summary: 'Recetas de diario para gente con prisa.', measureId: 'm1' },
  concept: {
    promise: 'Cenas de diario en 15 minutos.',
    pillars: [pillar(1), pillar(2), pillar(3)],
    audience: { description: 'Gente joven que vive sola.', region: 'espana', madeForKids: false },
    format: { presence: 'voz', longForm: 'Vídeos de diez minutos.', shortsRole: 'Un truco por Short.' },
    cadence: { longPerWeek: 1, shortsPerWeek: 3, hoursPerWeek: 6 },
    monetization: {
      rpmEurRange: { min: 1, max: 3 },
      confidence: 'baja',
      monthlyViewsAssumption: { min: 10_000, max: 50_000 },
      monthlyEurRange: { min: 10, max: 150 },
      yppRequirements: { subscribers: 1000, watchHours: 4000, shortsViews: 10_000_000 },
      assumptions: ['Supongo que tu público está en España.'],
      sourceIds: ['rpm', 'ypp'],
    },
    warnings: [{ code: 'solo_shorts', sourceId: 'shorts' }],
  },
  name: { displayName: 'Cocina Clara', handle: 'cocinaclara', status: 'elegido', checkId: null },
  context: null,
  sources: [
    { id: 'rpm', kind: 'conocimiento', label: 'Ganancias por nicho', url: null, date: '2026-10-01' },
    { id: 'ypp', kind: 'conocimiento', label: 'Programa de socios de YouTube', url: null, date: '2026-09-15' },
    { id: 'shorts', kind: 'conocimiento', label: 'Shorts en YouTube', url: null, date: '2026-09-20' },
    { id: 'm1', kind: 'youtube', label: 'YouTube', url: null, date: '2026-10-31T10:00:00.000Z' },
  ],
})

const measure: MeasureView = {
  id: 'm1',
  journeyId: 'j1',
  nicheLabel: 'Cocina fácil',
  queries: ['recetas fáciles'],
  source: 'ytdlp',
  status: 'medida',
  failure: null,
  demandMedianViews: 12_000,
  demandLevel: 'media',
  entryChannels: 4,
  entryLevel: 'entreabierta',
  concentration: 0.42,
  concentrationLevel: 'media',
  recentVideos: 9,
  recentShare: 0.3,
  sampleSize: 30,
  shortsInSample: 2,
  shortsMedianViews: null,
  unknownFormatVideos: 0,
  smallChannels: 12,
  hiddenSubscribers: 0,
  unreadChannels: 0,
  verdict: 'con_reservas',
  thresholdsVersion: 1,
  measuredAt: '2026-10-31T10:00:00.000Z',
  createdAt: '2026-10-31T09:59:00.000Z',
}

const reference: ReferenceChannelView = {
  id: 'r1',
  measureId: 'm1',
  youtubeChannelId: 'UC1234567890123456789012',
  title: 'Cocina de diario',
  handle: 'cocinadediario',
  subscribers: 8000,
  topVideoViews: 40_000,
  medianViews: 5000,
  bestRatio: 8,
  bestVideoId: 'v1',
  bestVideoTitle: 'Pasta en 10 minutos',
  reason: 'puerta_de_entrada',
  fetchedAt: '2026-10-31T10:00:00.000Z',
}

const channel = {
  id: 'c1',
  origin: 'nuevo' as const,
  displayName: 'Cocina Clara',
  handle: 'cocinaclara',
  youtubeChannelId: null,
}

const version = { version: 3, origin: 'manual' as const, createdAt: '2026-11-02T08:00:00.000Z', profile }
const exportedAt = '2026-11-05T12:00:00.000Z'
const input = { channel, version, measure, references: [reference], reading: null, exportedAt }

const headings = (markdown: string) => [...markdown.matchAll(/^## (.+)$/gm)].map(([, title]) => title)

describe('profileMarkdown and profileJson', () => {
  it('says the share of a new channel has no source, and not for one that existed (P1)', () => {
    expect(profileMarkdown(input)).toContain('sin fuente que lo respalde')
    const own = { ...version, profile: { ...profile, context: { currentProfile: 'Hoy.', readingId: 'r1' } } }
    expect(profileMarkdown({ ...input, version: own })).not.toContain('consigue un canal que empieza')
    // Started again «as new», it keeps its origin but has no context: the share has no source either.
    const asNew = { ...input, channel: { ...channel, origin: 'existente' as const } }
    expect(profileMarkdown(asNew)).toContain('consigue un canal que empieza')
  })

  it('both have the same sections, «Fuentes» last', () => {
    const markdown = profileMarkdown(input)
    const json = profileJson(input)
    const present = EXPORT_SECTIONS.filter((section) => section.present(input))
    expect(headings(markdown)).toEqual(present.map((section) => section.title))
    expect(Object.keys(json.sections)).toEqual(present.map((section) => section.id))
    expect(headings(markdown).at(-1)).toBe('Fuentes')
    expect(Object.keys(json.sections).at(-1)).toBe('fuentes')
  })

  it('the JSON carries the whole profile, the version and the data behind it', () => {
    const json = profileJson(input)
    expect(json.schemaVersion).toBe(1)
    expect(json.exportedAt).toBe(exportedAt)
    expect(channelProfileSchema.parse(json.profile)).toEqual(profile)
    expect(json.version).toEqual({ number: 3, origin: 'manual', createdAt: version.createdAt })
    expect(json.measures).toEqual([measure])
    expect(json.references).toEqual([reference])
    expect(json).not.toHaveProperty('reading')
  })

  it('«Fuentes» lists each YouTube figure with its date and each knowledge file with its review', () => {
    const markdown = profileMarkdown(input)
    const sources = markdown.slice(markdown.indexOf('## Fuentes'))
    expect(sources).toContain('Dato de YouTube · 31 oct 2026')
    expect(sources).toContain('Ganancias por nicho · revisado el 1 oct 2026')
    expect(sources).toContain('Programa de socios de YouTube · revisado el 15 sept 2026')
    expect(sources).toContain('Shorts en YouTube · revisado el 20 sept 2026')
    const json = profileJson(input)
    expect(json.sections.fuentes).toEqual(profile.sources)
  })

  it('the rhythm in words: singular for one, what it needs as an estimate, and when it does not fit; the data is unchanged', () => {
    const markdown = profileMarkdown(input)
    expect(markdown).toContain('- 1 vídeo largo y 3 Shorts por semana.')
    expect(markdown).toContain('- Tienes 6 horas a la semana.')
    expect(markdown).not.toContain('Este ritmo pide')

    // 1 long (4 h) and 3 Shorts (1 h each) need 7 hours: with 6 it does not fit.
    const tight = { ...input, rhythm: { hoursPerLongVideo: 4, hoursPerShort: 1 } }
    const over = profileMarkdown(tight)
    expect(over).toContain(
      '- Este ritmo pide unas 7 horas a la semana: unas 4 horas por vídeo largo y 1 hora por Short. (Estimación de YTCreator)',
    )
    expect(over).toContain(
      '- Este ritmo no te cabe en las horas que tienes: baja los vídeos por semana o dedícale más horas. (Estimación de YTCreator)',
    )
    // The data keeps the format of the saved profile (no estimate in it), and both files keep the same sections.
    expect(profileJson(tight)).toEqual(profileJson(input))
    expect(headings(over)).toEqual(headings(profileMarkdown(input)))

    const fits = profileMarkdown({ ...input, rhythm: { hoursPerLongVideo: 3, hoursPerShort: 1 } })
    expect(fits).toContain('Este ritmo pide unas 6 horas a la semana')
    expect(fits).not.toContain('Este ritmo no te cabe')
  })

  it('says what the screen says: niche with its figures and date, concept, name and @', () => {
    const markdown = profileMarkdown(input)
    expect(markdown).toContain('# Cocina Clara')
    expect(markdown).toContain('@cocinaclara')
    expect(markdown).toContain('Cocina fácil')
    expect(markdown).toContain('Un vídeo típico de este tema tiene 12.000 visitas.')
    expect(markdown).toContain('Cenas de diario en 15 minutos.')
    for (const n of [1, 2, 3]) expect(markdown).toContain(`Tema ${n}`)
    expect(markdown).toContain('De 10 a 150 € al mes con anuncios.')
    expect(markdown).toContain('Cocina de diario')
  })

  it('marks what the AI wrote as its opinion, never mixed with a YouTube figure', () => {
    const markdown = profileMarkdown(input)
    const lines = markdown.split('\n')
    const assumption = lines.find((line) => line.includes('Supongo que tu público está en España.'))
    expect(assumption).toContain('Opinión de la IA')
    for (const line of lines) {
      expect(line.includes('Opinión de la IA') && line.includes('Dato de YouTube')).toBe(false)
    }
  })

  it('a name left for later says so, with no @', () => {
    const later = {
      ...input,
      channel: { ...channel, displayName: null, handle: null },
      version: {
        ...version,
        profile: {
          ...profile,
          name: { displayName: null, handle: null, status: 'provisional' as const, checkId: null },
        },
      },
    }
    const markdown = profileMarkdown(later)
    expect(markdown).toContain('# Mi canal')
    expect(markdown).toContain('Nombre por decidir')
    expect(markdown).not.toContain('@null')
  })

  it('an existing channel: its current profile and what was read, with the date of the reading', () => {
    const reading: ChannelReadingView = {
      id: 'read1',
      channelId: 'c1',
      youtubeChannelId: 'UC1234567890123456789012',
      source: 'fake',
      title: 'Cocina Clara',
      handle: 'cocinaclara',
      description: '',
      subscribers: 1200,
      videoCount: 30,
      videos: [],
      summary: {
        videosRead: 30,
        lowInfo: false,
        partial: false,
        unknownFormat: 0,
        long: {
          count: 30,
          medianViews: 900,
          averageDurationSeconds: 600,
          videosPerWeek: 1,
          datedVideos: 30,
          best: [{ videoId: 'v9', title: 'Tortilla perfecta', views: 9000, ratio: 10, publishedAt: null }],
          worst: [],
        },
        short: {
          count: 0,
          medianViews: null,
          averageDurationSeconds: null,
          videosPerWeek: null,
          datedVideos: 0,
          best: [],
          worst: [],
        },
      },
      fetchedAt: '2026-10-20T10:00:00.000Z',
    }
    const existing = {
      ...input,
      channel: { ...channel, origin: 'existente' as const, youtubeChannelId: reading.youtubeChannelId },
      measure: null,
      references: [],
      reading,
      version: {
        ...version,
        profile: {
          ...profile,
          niche: { ...profile.niche, measureId: null },
          context: { currentProfile: 'Tema: Cocina de diario', readingId: 'read1' },
          sources: [
            ...profile.sources.filter((s) => s.kind === 'conocimiento'),
            { id: 'read1', kind: 'youtube' as const, label: 'YouTube', url: null, date: reading.fetchedAt },
          ],
        },
      },
    }
    const markdown = profileMarkdown(existing)
    expect(headings(markdown)).toContain('Tu canal hoy')
    expect(markdown).toContain('Tema: Cocina de diario')
    expect(markdown).toContain('«Tortilla perfecta» tuvo 10 veces lo normal en tu canal.')
    expect(markdown).toContain('Dato de YouTube · 20 oct 2026')
    const json = profileJson(existing)
    expect(json.reading).toEqual(reading)
    expect(json.measures).toEqual([])
  })

  it('names the file after the channel, with only safe characters', () => {
    expect(exportFileName({ displayName: 'Cocina Clara', handle: 'cocinaclara' }, 'md')).toBe('perfil-cocina-clara.md')
    expect(exportFileName({ displayName: '¡Ñandú y Más!', handle: null }, 'json')).toBe('perfil-nandu-y-mas.json')
    expect(exportFileName({ displayName: null, handle: null }, 'md')).toBe('perfil-de-mi-canal.md')
  })
})
