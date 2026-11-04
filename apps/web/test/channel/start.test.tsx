import type { ChannelCurrent } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { StartView } from '../../src/screens/channel/start/Start.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'

const text = channelEs.start
const at = '2026-11-01T10:00:00.000Z'
const channel = {
  id: 'c1',
  origin: 'nuevo' as const,
  displayName: null,
  handle: null,
  nameStatus: 'provisional' as const,
  youtubeChannelId: null,
  language: 'es',
  audienceRegion: 'espana' as const,
  archivedAt: null,
  createdAt: at,
  updatedAt: at,
}
const journey = {
  id: 'j1',
  channelId: 'c1',
  kind: 'nuevo' as const,
  step: 'nichos' as const,
  status: 'activo' as const,
  state: {},
  revision: 2,
  createdAt: at,
  updatedAt: at,
}

const render = (current: ChannelCurrent) =>
  renderToStaticMarkup(<StartView current={current} onCreate={() => {}} onResume={() => {}} onChooseName={() => {}} />)

// The button whose text is `label`, with its attributes.
const button = (html: string, label: string) =>
  [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map(([b]) => b).find((b) => b.includes(label))

describe('Start (FR-001)', () => {
  it('without a channel: «Crear mi canal» first, «Ya tengo un canal» second, each with its sentence', () => {
    const html = render({ channel: null })
    expect(html).toContain(text.createWhy)
    expect(html).toContain(text.existingWhy)
    expect(button(html, text.create)).toContain('data-variant="primary"')
    expect(button(html, text.existing)).not.toContain('data-variant="primary"')
    expect(html.indexOf(text.create)).toBeLessThan(html.indexOf(text.existing))
  })

  it('with a journey half done: «Seguir donde lo dejaste» and nothing to create', () => {
    const html = render({ channel, profile: null, journey })
    expect(button(html, text.resume)).toContain('data-variant="primary"')
    expect(html).not.toContain(text.create)
    expect(html).not.toContain(text.existing)
  })

  it('with the channel ready: the next step', () => {
    const done = { ...journey, step: 'hecho' as const, status: 'terminado' as const }
    const html = render({
      channel: { ...channel, displayName: 'Cocina Clara', nameStatus: 'elegido' },
      profile: null,
      journey: done,
    })
    expect(html).toContain('Cocina Clara')
    expect(html).toContain(text.nextStep)
    expect(html).not.toContain(text.nameMissing)
  })

  it('with a provisional name: «Te falta elegir el nombre» (FR-018b)', () => {
    const done = { ...journey, step: 'hecho' as const, status: 'terminado' as const }
    const html = render({ channel, profile: null, journey: done })
    expect(html).toContain(text.nextStep)
    expect(html).toContain(text.nameMissing)
    expect(button(html, text.chooseName)).toBeTruthy()
  })
})
