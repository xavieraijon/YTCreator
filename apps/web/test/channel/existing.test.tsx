import type { ReadingSummary, YouTubeFailureCode } from '@ytcreator/core'
import type { ChannelReadingView, JourneyFullView, ProposalView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChannelUrlView, notFoundText } from '../../src/screens/channel/existing/ChannelUrl.tsx'
import { ConfirmView } from '../../src/screens/channel/existing/Confirm.tsx'
import { CurrentProfileCard, Positioning } from '../../src/screens/channel/existing/Positioning.tsx'
import { LowInfo, Reading, ReadingProgress, ReadingSummaryView } from '../../src/screens/channel/existing/Reading.tsx'
import { ConceptDetails } from '../../src/screens/channel/new/Concepts.tsx'
import { Names } from '../../src/screens/channel/new/Names.tsx'
import { ApiClientError } from '../../src/api/client.ts'
import { needsSettings } from '../../src/shell/errorText.ts'
import { channelEs } from '../../src/strings/channel.es.ts'
import { es } from '../../src/strings/es.ts'
import { youtubeFailureActionsEs } from '../../src/strings/youtube-failures.es.ts'

const text = channelEs.existing
const noop = () => undefined
const reload = async () => undefined

const formatSummary = (changes: Partial<ReadingSummary['long']> = {}): ReadingSummary['long'] => ({
  count: 0,
  medianViews: null,
  averageDurationSeconds: null,
  videosPerWeek: null,
  datedVideos: 0,
  best: [],
  worst: [],
  ...changes,
})

const video = (id: string, title: string, ratio: number | null = null) => ({
  id,
  title,
  views: 1000,
  durationSeconds: 600,
  publishedAt: null,
  isShort: false,
  ratio,
})

const reading = (summary: Partial<ReadingSummary> = {}, changes: Partial<ChannelReadingView> = {}) =>
  ({
    id: 'r1',
    channelId: 'c1',
    youtubeChannelId: 'UC1',
    source: 'fake',
    title: 'Cocina Corta',
    handle: 'cocinacorta',
    description: '',
    subscribers: 1000,
    videoCount: 30,
    videos: [video('v1', 'Tortilla en 10 minutos', 3.24), video('v2', 'Lentejas sin receta', 0.4)],
    summary: {
      videosRead: 30,
      lowInfo: false,
      partial: false,
      unknownFormat: 0,
      long: formatSummary({
        count: 20,
        medianViews: 12_000,
        averageDurationSeconds: 630,
        videosPerWeek: 1.5,
        datedVideos: 20,
        best: [{ videoId: 'v1', title: 'Tortilla en 10 minutos', views: 40_000, ratio: 3.24, publishedAt: null }],
        worst: [{ videoId: 'v2', title: 'Lentejas sin receta', views: 3000, ratio: 0.4, publishedAt: null }],
      }),
      short: formatSummary({ count: 10, medianViews: 800, averageDurationSeconds: 45, datedVideos: 3 }),
      ...summary,
    },
    fetchedAt: '2026-11-04T10:00:00.000Z',
    ...changes,
  }) as ChannelReadingView

const proposal = (kind: ProposalView['kind'], payload: object, changes: Partial<ProposalView> = {}) =>
  ({
    id: `p-${kind}`,
    journeyId: 'j1',
    kind,
    payload,
    editedPayload: null,
    selectedIndex: null,
    status: 'propuesta',
    parentId: null,
    instructions: null,
    promptId: kind,
    promptVersion: 1,
    claimsTrimmed: false,
    usageId: null,
    createdAt: '2026-11-04T10:00:00.000Z',
    decidedAt: null,
    ...changes,
  }) as ProposalView

const journey = (changes: Partial<JourneyFullView> = {}) =>
  ({
    id: 'j1',
    channelId: 'c1',
    kind: 'existente',
    step: 'lectura',
    status: 'activo',
    state: {},
    revision: 3,
    proposals: [],
    measures: [],
    nameChecks: [],
    jobs: [],
    warnings: {},
    measureStaleDays: 90,
    reading: reading(),
    createdAt: '2026-11-04T10:00:00.000Z',
    updatedAt: '2026-11-04T10:00:00.000Z',
    ...changes,
  }) as unknown as JourneyFullView

const cited = (value: string, videoIds = ['v1']) => ({ text: value, videoIds })
const current = {
  niche: cited('Recetas rápidas de diario.'),
  pillars: [cited('Cenas en poco tiempo.')],
  audience: cited('Gente que cocina entre semana.'),
  works: [cited('Los títulos con el tiempo de la receta.')],
  doesNotWork: [cited('Los vídeos largos sin receta.', ['v2'])],
}
const figures = {
  monetization: {
    rpmEurRange: { min: 1, max: 3 },
    monthlyViewsAssumption: null,
    monthlyEurRange: null,
    yppRequirements: { subscribers: 1000, watchHours: 4000, shortsViews: 10_000_000 },
    rpmSource: { label: 'AIR', reviewedAt: '2026-10-01', confidence: 'baja' },
    yppSource: { label: 'YouTube', reviewedAt: '2026-10-01' },
  },
  warnings: [],
}
const positioning = {
  promise: 'Cenas de diario en 20 minutos.',
  pillars: [
    { title: 'Cenas', description: 'Rápidas.' },
    { title: 'Tupper', description: 'Para llevar.' },
    { title: 'Básicos', description: 'Técnicas.' },
  ],
  audience: { description: 'Gente que cocina.', region: 'espana', madeForKids: false },
  format: { presence: 'voz', longForm: 'Vídeos de diez minutos.', shortsRole: 'Un truco.' },
  cadence: { longPerWeek: 1, shortsPerWeek: 3, hoursPerWeek: 6 },
  monetization: { category: 'estilo_de_vida', assumptions: ['Público de España.'] },
  changes: [{ what: 'Centrar el canal en cenas rápidas.', why: 'Es lo que mejor funciona.', videoIds: ['v1'] }],
  figures,
}

describe('ChannelUrl', () => {
  it('asks for the link of the channel, its @ or the link of a video, with examples, in plain words', () => {
    const html = renderToStaticMarkup(<ChannelUrlView value="" onChange={noop} onSubmit={noop} />)
    expect(html).toContain(text.url.label)
    expect(html).toContain(text.url.help)
    expect(html).toContain(text.url.search)
    expect(html).toContain(text.url.why)
    expect(html).not.toMatch(/\bURL\b/)
  })

  it('a channel not found says what happened and what to paste instead, with an example (US4 AS4)', () => {
    expect(notFoundText).toMatch(/enlace|@/)
    expect(notFoundText).toContain('@')
    const html = renderToStaticMarkup(
      <ChannelUrlView value="@nada" fieldError={notFoundText} onChange={noop} onSubmit={noop} />,
    )
    expect(html).toContain('No hemos encontrado')
  })

  it('what may be settled in the settings takes there, besides asking again', () => {
    const toSettings = renderToStaticMarkup(
      <ChannelUrlView value="@a" failure="No está listo" onSettings={noop} onChange={noop} onSubmit={noop} />,
    )
    expect(toSettings).toContain(youtubeFailureActionsEs.ir_a_ajustes)
    // That failure may also be a passing one, so asking again stays.
    expect(toSettings).toContain(es.app.retry)
    const again = renderToStaticMarkup(
      <ChannelUrlView value="@a" failure="Ha tardado" onChange={noop} onSubmit={noop} />,
    )
    expect(again).toContain(es.app.retry)
    expect(again).not.toContain(youtubeFailureActionsEs.ir_a_ajustes)
  })

  it('only the failure of the reader goes to the settings', () => {
    const failed = (youtubeFailure: YouTubeFailureCode) =>
      new ApiClientError('api', 502, { code: 'youtube', youtubeFailure } as never)
    expect(needsSettings(failed('no_disponible'))).toBe(true)
    expect(needsSettings(failed('tiempo_agotado'))).toBe(false)
    expect(needsSettings(new Error('otro'))).toBe(false)
  })

  it('an empty link is said so', () => {
    const html = renderToStaticMarkup(
      <ChannelUrlView value="" fieldError={text.url.empty} onChange={noop} onSubmit={noop} />,
    )
    expect(html).toContain(text.url.empty)
  })
})

describe('Confirm (US4 AS1)', () => {
  const channel = {
    channelId: 'UC1',
    title: 'Cocina Corta',
    handle: 'cocinacorta',
    subscribers: 5500,
    thumbnailUrl: 'https://yt3.ggpht.com/foto=s88',
    fetchedAt: '2026-11-01T10:00:00.000Z',
  }

  it('shows the name, the @, the image and the subscribers, and asks if it is theirs', () => {
    const html = renderToStaticMarkup(<ConfirmView channel={channel} onConfirm={noop} onReject={noop} />)
    expect(html).toContain('Cocina Corta')
    expect(html).toContain('@cocinacorta')
    expect(html).toContain('5500 suscriptores')
    expect(html).toContain('src="https://yt3.ggpht.com/foto=s88"')
    expect(html).toContain('referrerPolicy="no-referrer"')
    expect(html).toContain(text.confirm.yes)
    expect(html).toContain(text.confirm.no)
  })

  it('with no image, @ or figure it still reads well', () => {
    const html = renderToStaticMarkup(
      <ConfirmView
        channel={{ ...channel, thumbnailUrl: null, handle: null, subscribers: null }}
        onConfirm={noop}
        onReject={noop}
      />,
    )
    expect(html).not.toContain('<img')
    expect(html).toContain(text.confirm.noHandle)
    expect(html).toContain(channelEs.references.hiddenSubscribers)
  })
})

describe('Reading', () => {
  it('says how the reading goes while it lasts', () => {
    const html = renderToStaticMarkup(<ReadingProgress done={1} total={2} />)
    expect(html).toContain(text.reading.progress)
    expect(html).toContain(text.reading.progressHelp)
  })

  it('shows the figures by format as data with their date (US4 AS2, FR-020b)', () => {
    const html = renderToStaticMarkup(<ReadingSummaryView reading={reading()} />)
    expect(html).toContain('Hemos leído 30 vídeos')
    expect(html).toContain('Vídeos largos')
    expect(html).toContain('Shorts')
    expect(html).toContain('12.000')
    expect(html).toContain('10 min 30 s')
    expect(html).toContain('1,5')
    expect(html).toContain('data-kind="youtube"')
  })

  it('the best and the worst say «veces lo normal en su canal»', () => {
    const html = renderToStaticMarkup(<ReadingSummaryView reading={reading()} />)
    expect(html).toContain('Tortilla en 10 minutos')
    expect(html).toContain('3,2 veces lo normal en su canal')
    expect(html).toContain('Lentejas sin receta')
    expect(html).toContain('0,4 veces lo normal en su canal')
    expect(html).toContain(text.reading.best)
    expect(html).toContain(text.reading.worst)
  })

  it('what is not known is said, never filled in', () => {
    const html = renderToStaticMarkup(
      <ReadingSummaryView
        reading={reading({
          partial: true,
          long: formatSummary({ count: 20, datedVideos: 15, medianViews: null }),
          short: formatSummary(),
        })}
      />,
    )
    expect(html).toContain(text.reading.partial)
    expect(html).toContain(text.reading.noPace)
    // Part of it could not be read: it does not say there are no Shorts, because it does not know.
    expect(html).toContain(text.reading.emptyPartial)
    expect(html).not.toContain(text.reading.noShorts)
    expect(html).toContain(text.reading.partialDates)

    const whole = renderToStaticMarkup(
      <ReadingSummaryView
        reading={reading({ long: formatSummary({ count: 20, datedVideos: 20 }), short: formatSummary() })}
      />,
    )
    expect(whole).toContain(text.reading.noShorts)
  })

  it('offers to see the current profile with what it costs', () => {
    const html = renderToStaticMarkup(<Reading view={journey()} busy={false} reload={reload} onStep={noop} />)
    expect(html).toContain(text.reading.see)
    expect(html).not.toContain(text.reading.asNew)
  })

  it('a channel with few videos says so and offers the new journey keeping the name and the @ (FR-022)', () => {
    const html = renderToStaticMarkup(<LowInfo title="Cocina en Tres" handle="cocinatres" busy={false} onNew={noop} />)
    expect(html).toContain(text.reading.lowInfo)
    expect(html).toContain('Cocina en Tres')
    expect(html).toContain('@cocinatres')
    expect(html).toContain(text.reading.asNew)
    expect(html).not.toContain(text.reading.readAgain)

    const partly = renderToStaticMarkup(
      <LowInfo title="Cocina" handle="no es una arroba" busy={false} partial onNew={noop} onReadAgain={noop} />,
    )
    expect(partly).toContain(text.reading.readAgain)
    expect(partly).toContain(text.reading.asNewWhyNoHandle)
    expect(partly).not.toContain('no es una arroba')

    // Letters of any language are an @ of YouTube too (entry 84).
    const withLetters = renderToStaticMarkup(
      <LowInfo title="Cocina" handle="cocinaespañola" busy={false} onNew={noop} />,
    )
    expect(withLetters).toContain('@cocinaespañola')
    expect(withLetters).toContain(text.reading.asNewWhy)

    // With no name at all, it does not promise to keep one.
    const nameless = renderToStaticMarkup(<LowInfo title="  " handle={null} busy={false} onNew={noop} />)
    expect(nameless).toContain(text.reading.asNewWhyNoName)
    expect(nameless).not.toContain('Se queda con')
    // With only the @, that is its name.
    const onlyHandle = renderToStaticMarkup(<LowInfo title="" handle="micanal" busy={false} onNew={noop} />)
    expect(onlyHandle).toContain('el nombre micanal y la @micanal')

    const read = reading()
    const few = journey({ reading: { ...read, summary: { ...read.summary, lowInfo: true } } })
    const screen = renderToStaticMarkup(<Reading view={few} busy={false} reload={reload} onStep={noop} />)
    expect(screen).toContain(text.reading.asNew)
    expect(screen).not.toContain(text.reading.see)
  })
})

describe('Positioning', () => {
  it('what a long video gets is data of YouTube, and what the money supposes is not (FR-008, principle II)', () => {
    const withMoney = {
      ...positioning,
      changes: [],
      figures: {
        monetization: {
          ...figures.monetization,
          monthlyViewsAssumption: { min: 5000, max: 5000 },
          monthlyEurRange: { min: 5, max: 15 },
        },
        warnings: [],
      },
    }
    const html = renderToStaticMarkup(
      <ConceptDetails concept={withMoney as never} own={{ medianViews: 1200, readAt: '2026-11-04T10:00:00.000Z' }} />,
    )
    expect(html).toContain('5000 visitas al mes')
    const median = html.indexOf('consigue 1200 visitas')
    expect(median).toBeGreaterThan(html.indexOf('5000 visitas al mes'))
    expect(html.indexOf('data-kind="youtube"')).toBeGreaterThan(median)
    const ofANiche = renderToStaticMarkup(<ConceptDetails concept={withMoney as never} />)
    expect(ofANiche).not.toContain('data-kind="youtube"')
    // P1: the share of the niche a new channel gets is said to have no source; its own videos are data.
    expect(ofANiche).toContain('consigue un canal que empieza')
    expect(html).not.toContain('consigue un canal que empieza')
  })

  it('each claim of the current profile cites its videos, apart from the opinion (US4 AS3)', () => {
    const html = renderToStaticMarkup(<CurrentProfileCard profile={current} reading={reading()} />)
    expect(html).toContain('Los títulos con el tiempo de la receta.')
    expect(html).toContain('Tortilla en 10 minutos')
    expect(html).toContain('3,2 veces lo normal en su canal')
    expect(html).toContain('data-kind="ia"')
    expect(html).toContain('data-kind="youtube"')
    expect(html).toContain(text.positioning.works)
    expect(html).toContain(text.positioning.doesNotWork)
  })

  const atPositioning = (props: { trimmedProfile?: boolean; trimmedProposal?: boolean; withProposal?: boolean }) =>
    renderToStaticMarkup(
      <Positioning
        view={journey({
          step: 'posicionamiento',
          proposals: [
            proposal('perfil_actual', current, {
              status: 'aprobada',
              claimsTrimmed: props.trimmedProfile === true,
            }),
            ...(props.withProposal
              ? [proposal('posicionamiento', positioning, { claimsTrimmed: props.trimmedProposal === true })]
              : []),
          ],
        })}
        busy={false}
        reload={reload}
        onStep={noop}
      />,
    )

  it('asks for the proposal, saying what it costs', () => {
    expect(atPositioning({})).toContain(text.positioning.generate)
  })

  it('shows the proposal with its changes, its ranges, and the three ways to answer', () => {
    const html = atPositioning({ withProposal: true })
    expect(html).toContain('Centrar el canal en cenas rápidas.')
    expect(html).toContain('Cenas de diario en 20 minutos.')
    expect(html).toContain(channelEs.concepts.moneyUnknownOwn)
    expect(html).toContain(channelEs.proposal.approve)
    expect(html).toContain(channelEs.proposal.edit)
    expect(html).toContain(channelEs.proposal.regenerate)
    expect(html).not.toContain(channelEs.concepts.choose)
  })

  it('says what the check of figures took away, in both (P18)', () => {
    expect(atPositioning({ trimmedProfile: true })).toContain(channelEs.proposal.claimsTrimmed)
    expect(atPositioning({ withProposal: true, trimmedProposal: true })).toContain(channelEs.proposal.claimsTrimmed)
    expect(atPositioning({ withProposal: true })).not.toContain(channelEs.proposal.claimsTrimmed)
  })
})

describe('Names of a channel that keeps its name (FR-022)', () => {
  it('says the name it has and only asks to finish', () => {
    const view = journey({
      kind: 'nuevo',
      step: 'nombres',
      reading: null,
      state: { keptName: { displayName: 'Cocina en Tres', handle: 'cocinatres' } },
    })
    const html = renderToStaticMarkup(<Names view={view} busy={false} reload={reload} onFinish={noop} />)
    expect(html).toContain('Cocina en Tres')
    expect(html).toContain('@cocinatres')
    expect(html).toContain(channelEs.names.finish)
    expect(html).not.toContain(channelEs.names.generate)
    expect(html).not.toContain(channelEs.names.later)
  })
})
