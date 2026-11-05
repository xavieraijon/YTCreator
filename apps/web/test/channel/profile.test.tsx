import type { ChannelProfile } from '@ytcreator/core'
import type { ChannelView, MeasureView, ProfileVersionView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { exportUrl, ExportButtons } from '../../src/screens/channel/profile/Export.tsx'
import { ProfileView, type ProfileData } from '../../src/screens/channel/profile/Profile.tsx'
import { ProfileHistory } from '../../src/screens/channel/profile/ProfileHistory.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'

const text = channelEs.profile
const noop = () => undefined
const NOW = new Date('2026-11-05T12:00:00.000Z')
const DAY = 86_400_000

const pillar = (n: number) => ({ title: `Tema ${n}`, description: `Qué entra en el tema ${n}.` })
const profile: ChannelProfile = {
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
    warnings: [],
  },
  name: { displayName: 'Cocina Clara', handle: 'cocinaclara', status: 'elegido', checkId: null },
  context: null,
  sources: [{ id: 'rpm', kind: 'conocimiento', label: 'Ganancias por nicho', url: null, date: '2026-10-01' }],
}

const channel: ChannelView = {
  id: 'c1',
  origin: 'nuevo',
  displayName: 'Cocina Clara',
  handle: 'cocinaclara',
  nameStatus: 'elegido',
  youtubeChannelId: null,
  language: 'es',
  audienceRegion: 'espana',
  archivedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
}

const measure = (measuredAt: string): MeasureView => ({
  id: 'm1',
  journeyId: 'j1',
  nicheLabel: 'Cocina fácil',
  queries: ['recetas fáciles'],
  source: 'fake',
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
  measuredAt,
  createdAt: measuredAt,
})

const version = (v: number, origin: ProfileVersionView['origin'], changes: Partial<ChannelProfile> = {}) => ({
  channelId: 'c1',
  version: v,
  origin,
  restoredFrom: origin === 'restaurada' ? 1 : null,
  proposalId: null,
  profile: { ...profile, ...changes },
  createdAt: new Date(NOW.getTime() - (10 - v) * DAY).toISOString(),
})

const data = (changes: Partial<ProfileData> = {}): ProfileData => ({
  channel,
  current: version(2, 'manual'),
  measure: measure(new Date(NOW.getTime() - 3 * DAY).toISOString()),
  reading: null,
  staleDays: 90,
  ...changes,
})

const render = (shown: ProfileData) =>
  renderToStaticMarkup(<ProfileView data={shown} now={NOW} onEdit={noop} onChooseName={noop} />)

const button = (html: string, label: string) =>
  [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map(([b]) => b).find((b) => b.includes(label))

describe('Profile (US5 AS1)', () => {
  it('shows the niche with its figures and date, the concept, the name and the @', () => {
    const html = render(data())
    expect(html).toContain('Cocina fácil')
    expect(html).toContain('12.000')
    expect(html).toContain('Dato de YouTube')
    expect(html).toContain('Cenas de diario en 15 minutos.')
    for (const n of [1, 2, 3]) expect(html).toContain(`Tema ${n}`)
    expect(html).toContain('Cocina Clara')
    expect(html).toContain('@cocinaclara')
  })

  it('what the AI supposes goes with «Opinión de la IA»', () => {
    const html = render(data())
    expect(html).toContain('Supongo que tu público está en España.')
    expect(html).toContain('Opinión de la IA')
  })

  it('a promise the creator wrote is marked as theirs, not as the AI (principle II)', () => {
    expect(render(data({ aiPromise: 'Otra promesa de la IA.' }))).toContain(text.promiseByCreator)
    expect(render(data({ aiPromise: 'Cenas de diario en 15 minutos.' }))).not.toContain(text.promiseByCreator)
    expect(render(data())).not.toContain(text.promiseByCreator)
  })

  it('the next step is the idea bank, coming soon', () => {
    expect(render(data())).toContain(text.nextStep)
  })

  it('«Editar» is there to change it by hand', () => {
    expect(button(render(data()), text.edit)).toBeTruthy()
  })

  it('a name left for later says so and offers to choose it', () => {
    const later = data({
      channel: { ...channel, displayName: null, handle: null, nameStatus: 'provisional' },
      current: version(1, 'ia', { name: { displayName: null, handle: null, status: 'provisional', checkId: null } }),
    })
    const html = render(later)
    expect(html).toContain(channelEs.start.nameMissing)
    expect(button(html, channelEs.start.chooseName)).toBeTruthy()
    expect(html).not.toContain('@null')
  })
})

describe('figures older than 90 days (US5 AS4, FR-027)', () => {
  it('warn that they may have changed', () => {
    const old = data({ measure: measure(new Date(NOW.getTime() - 91 * DAY).toISOString()) })
    expect(render(old)).toContain(channelEs.niches.stale.replace('{dias}', '90'))
    expect(render(data())).not.toContain(channelEs.niches.stale.replace('{dias}', '90'))
  })
})

describe('Export (US5 AS3)', () => {
  it('«Descargar como documento» first, «Descargar como datos» second', () => {
    const html = renderToStaticMarkup(<ExportButtons channelId="c1" />)
    expect(button(html, text.downloadDocument)).toContain('data-variant="primary"')
    expect(button(html, text.downloadData)).not.toContain('data-variant="primary"')
    expect(html.indexOf(text.downloadDocument)).toBeLessThan(html.indexOf(text.downloadData))
  })

  it('each one asks for its own file', () => {
    expect(exportUrl('c1', 'md')).toBe('/api/channels/c1/export?format=md')
    expect(exportUrl('c 1', 'json')).toBe('/api/channels/c%201/export?format=json')
  })
})

describe('ProfileHistory (US5 AS2)', () => {
  const versions = [
    { version: 1, origin: 'ia' as const, createdAt: '2026-11-01T10:00:00.000Z' },
    { version: 2, origin: 'manual' as const, createdAt: '2026-11-02T10:00:00.000Z' },
    { version: 3, origin: 'restaurada' as const, createdAt: '2026-11-03T10:00:00.000Z' },
  ]
  const html = renderToStaticMarkup(
    <ProfileHistory versions={versions} current={3} busy={null} onRestore={noop} onShow={noop} />,
  )

  it('lists every version, newest first, with where it came from', () => {
    expect(html.indexOf(text.origin.restaurada)).toBeLessThan(html.indexOf(text.origin.manual))
    expect(html.indexOf(text.origin.manual)).toBeLessThan(html.indexOf(text.origin.ia))
  })

  it('every version but the current one can be brought back', () => {
    const restores = html.match(new RegExp(text.restore, 'g')) ?? []
    expect(restores).toHaveLength(2)
    expect(html).toContain(text.currentVersion)
  })
})
