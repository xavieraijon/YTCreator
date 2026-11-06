import type { MeasureView, ReferenceChannelView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InterestsView, interestsError } from '../../src/screens/channel/new/Interests.tsx'
import { isStale, NicheCard } from '../../src/screens/channel/new/NicheCard.tsx'
import { OpinionCard } from '../../src/screens/channel/new/Niches.tsx'
import { QuestionsView } from '../../src/screens/channel/new/Questions.tsx'
import { ReferenceCard } from '../../src/screens/channel/new/References.tsx'
import { parseHours, RhythmView } from '../../src/screens/channel/new/Rhythm.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'
import { youtubeFailuresEs } from '../../src/strings/youtube-failures.es.ts'

const text = channelEs.niches
const at = '2026-11-01T10:00:00.000Z'
const niche = {
  label: 'Cocina rápida',
  summary: 'Recetas en veinte minutos.',
  queries: ['recetas'],
  whyItFits: 'Te gusta.',
}
const measure: MeasureView = {
  id: 'm1',
  journeyId: 'j1',
  nicheLabel: niche.label,
  queries: niche.queries,
  source: 'fake',
  status: 'medida',
  failure: null,
  demandMedianViews: 60_000,
  demandLevel: 'alta',
  entryChannels: 4,
  entryLevel: 'abierta',
  concentration: 0.3,
  concentrationLevel: 'baja',
  recentVideos: 6,
  recentShare: 0.5,
  sampleSize: 30,
  shortsInSample: 5,
  shortsMedianViews: null,
  unknownFormatVideos: 0,
  smallChannels: 2,
  hiddenSubscribers: 1,
  unreadChannels: 0,
  verdict: 'conviene',
  thresholdsVersion: 3,
  measuredAt: at,
  createdAt: at,
}
const failed = (failure: MeasureView['failure']): MeasureView => ({
  ...measure,
  status: 'fallida',
  failure,
  demandMedianViews: null,
  demandLevel: null,
  entryChannels: null,
  entryLevel: null,
  concentration: null,
  concentrationLevel: null,
  recentVideos: null,
  recentShare: null,
  sampleSize: null,
  shortsInSample: null,
  hiddenSubscribers: null,
  unreadChannels: null,
  verdict: null,
  measuredAt: null,
})
const card = (props: Partial<Parameters<typeof NicheCard>[0]> = {}) =>
  renderToStaticMarkup(<NicheCard niche={niche} measure={measure} onChoose={() => {}} onRetry={() => {}} {...props} />)
const count = (html: string, part: string) => html.split(part).length - 1

describe('Interests', () => {
  it('explains «nicho» in a sentence', () => {
    const html = renderToStaticMarkup(<InterestsView onNext={() => {}} />)
    expect(html).toContain('Un nicho es el tema concreto de tu canal')
  })
  it('takes 10 to 1.000 characters', () => {
    expect(interestsError('corto')).toBe(channelEs.interests.tooShort)
    expect(interestsError('x'.repeat(1001))).toBe(channelEs.interests.tooLong)
    expect(interestsError('x'.repeat(10))).toBeUndefined()
  })
})

describe('Questions', () => {
  const questions = [{ id: 'a', question: '¿Cuánto tiempo tienes?', why: 'Para ajustar.' }]
  it('can be skipped', () => {
    const html = renderToStaticMarkup(<QuestionsView questions={questions} onNext={() => {}} onSkip={() => {}} />)
    expect(html).toContain(questions[0]!.question)
    expect(html).toContain(channelEs.questions.skip)
  })
  it('with no questions says so and only offers to go on', () => {
    const html = renderToStaticMarkup(<QuestionsView questions={[]} onNext={() => {}} onSkip={() => {}} />)
    expect(html).toContain(channelEs.questions.none)
    expect(html).not.toContain(channelEs.questions.skip)
  })
})

describe('NicheCard', () => {
  it('every figure says it is data from YouTube, apart from the opinion', () => {
    const html = card()
    expect(count(html, 'data-kind="youtube"')).toBe(5)
    expect(count(html, 'data-kind="ia"')).toBe(1)
    expect(html).toContain('60.000')
  })

  it('shows the verdict with its reason, in words', () => {
    const html = card()
    expect(html).toContain(text.verdict.conviene)
    expect(html).toContain(text.reason.buen_equilibrio)
    const against = card({ measure: { ...measure, demandLevel: 'baja', verdict: 'no_conviene' } })
    expect(against).toContain(text.verdict.no_conviene)
    expect(against).toContain(text.reason.demanda_baja)
  })

  it('shows Shorts apart, and says who was left out', () => {
    const html = card()
    expect(html).toContain('Han salido 5 Shorts')
    expect(html).toContain('Un canal no enseña')
    expect(card({ measure: { ...measure, shortsInSample: 0 } })).not.toContain('Han salido')
  })

  it('channels outside the sample are not said to hide their subscribers (G3)', () => {
    const html = card({ measure: { ...measure, hiddenSubscribers: 0, unreadChannels: 12 } })
    expect(html).toContain('De 12 canales de los resultados no hemos mirado los suscriptores')
    expect(html).not.toContain('no enseñan sus suscriptores')
    expect(card({ measure: { ...measure, hiddenSubscribers: 0, unreadChannels: 1 } })).toContain('De un canal')
  })

  it('with yt-dlp, recent videos say only the newest of each channel have a date (G2)', () => {
    const html = card({ measure: { ...measure, source: 'ytdlp', recentVideos: 7, recentShare: 0.5 } })
    expect(html).toContain('puede haber más')
    expect(html).not.toContain('50 %')
  })

  it('saturation without dates says there is no data', () => {
    const html = card({ measure: { ...measure, recentVideos: null, recentShare: null } })
    expect(html).toContain(text.indicators.saturationUnknown)
  })

  it('«sin datos» shows no figure and no verdict', () => {
    const html = card({ measure: failed('sin_datos') })
    expect(html).toContain(youtubeFailuresEs.sin_datos.what)
    expect(count(html, 'data-kind="youtube"')).toBe(0)
    expect(html).not.toContain(text.verdict.conviene)
    expect(html).not.toContain('60.000')
  })

  it('«bloqueado» offers to try again; no reader goes to settings', () => {
    expect(card({ measure: failed('bloqueado') })).toContain('Volver a intentarlo')
    expect(card({ measure: failed('no_disponible') })).toContain('Ir a Ajustes')
  })

  it('warns about children and policies with the source', () => {
    const html = card({
      warnings: [
        { code: 'infantil', sourceLabel: 'Ayuda de YouTube', reviewedAt: '2026-11-01' },
        { code: 'no_autentico', sourceLabel: 'Normas de YouTube', reviewedAt: '2026-11-01' },
      ],
    })
    expect(html).toContain(text.warnings.infantil)
    expect(html).toContain(text.warnings.no_autentico)
    expect(html).toContain('Ayuda de YouTube')
    expect(count(html, 'data-kind="conocimiento"')).toBe(2)
  })

  it('offers to choose, and marks the one chosen', () => {
    expect(card()).toContain(text.choose)
    const chosen = card({ chosen: true })
    expect(chosen).toContain(text.chosen)
    expect(chosen).not.toContain(text.choose)
  })

  it('waits while it is measuring', () => {
    const html = card({ measure: null })
    expect(html).toContain(text.pending)
    expect(html).toMatch(/<button[^>]*disabled[^>]*>(?:(?!<\/button>).)*Elegir este nicho/)
  })

  it('old figures ask to be measured again', () => {
    const later = new Date('2027-03-01T00:00:00Z')
    expect(isStale(measure, 90, later)).toBe(true)
    expect(isStale(measure, 90, new Date('2026-11-20T00:00:00Z'))).toBe(false)
    expect(card({ stale: true })).toContain(text.measureAgain)
    expect(card()).not.toContain(text.measureAgain)
  })
})

describe('OpinionCard (FR-010)', () => {
  it('is marked as an opinion and says what does not suit', () => {
    const html = renderToStaticMarkup(
      <OpinionCard
        opinion={{ recommendedLabel: 'Uno', why: 'Creo que sí.', cautions: [{ label: 'Dos', why: 'Poco público.' }] }}
      />,
    )
    expect(html).toContain('data-kind="ia"')
    expect(html).toContain('Elegiría «Uno»')
    expect(html).toContain('Poco público.')
    expect(count(html, 'data-kind="youtube"')).toBe(0)
  })
})

describe('ReferenceCard (FR-012)', () => {
  const reference: ReferenceChannelView = {
    id: 'r1',
    measureId: 'm1',
    youtubeChannelId: 'UC1',
    title: 'Canal',
    handle: 'canal',
    subscribers: 1000,
    topVideoViews: 5000,
    medianViews: 800,
    bestRatio: 3.25,
    bestVideoId: 'v1',
    bestVideoTitle: 'Mi vídeo',
    reason: 'puerta_de_entrada',
    fetchedAt: at,
  }
  const render = (changes: Partial<ReferenceChannelView> = {}, canRemove = true) =>
    renderToStaticMarkup(
      <ReferenceCard reference={{ ...reference, ...changes }} canRemove={canRemove} onRemove={() => {}} />,
    )

  it('compares its best video with what is normal in that channel, as data', () => {
    const html = render()
    expect(html).toContain('«Mi vídeo» tuvo 3,3 veces lo normal en su canal.')
    expect(html).toContain('800')
    expect(html).toContain('data-kind="youtube"')
    expect(html).toContain(channelEs.references.reason.puerta_de_entrada)
  })
  it('without the comparison it says nothing about it', () => {
    const html = render({ medianViews: null, bestRatio: null, bestVideoTitle: null })
    expect(html).not.toContain('lo normal')
  })
  it('only offers to remove when it can', () => {
    expect(render({}, false)).not.toContain(channelEs.references.remove)
  })
})

describe('Rhythm', () => {
  it('takes whole hours from 1 to 60', () => {
    expect(parseHours('1')).toBe(1)
    expect(parseHours('60')).toBe(60)
    expect(parseHours('0')).toBeNull()
    expect(parseHours('61')).toBeNull()
    expect(parseHours('2,5')).toBeNull()
    expect(parseHours('')).toBeNull()
  })
  it('asks for hours, how to appear and where the audience is', () => {
    const html = renderToStaticMarkup(<RhythmView onNext={() => {}} />)
    expect(html).toContain(channelEs.rhythm.hours)
    expect(html).toContain(channelEs.rhythm.onCameraOptions.voz)
    expect(html).toContain(channelEs.rhythm.regionOptions.latam)
  })
})
