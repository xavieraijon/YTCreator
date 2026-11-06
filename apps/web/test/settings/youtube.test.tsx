import type { UsageList, YouTubeSettings } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KnowledgeAge, UsageLogView } from '../../src/screens/settings/UsageLog.tsx'
import { YouTubeSettingsView } from '../../src/screens/settings/YouTubeSettings.tsx'
import { es } from '../../src/strings/es.ts'

const text = es.youtubeSettings
const noop = () => undefined

const settings = (changes: Partial<YouTubeSettings> = {}): YouTubeSettings => ({
  source: 'auto',
  effectiveSource: 'ytdlp',
  ytdlpVersion: '2026.08.19',
  apiKey: { set: false, hint: null, rejected: false },
  ...changes,
})

const render = (shown: YouTubeSettings, updating = false) =>
  renderToStaticMarkup(
    <YouTubeSettingsView
      settings={shown}
      updating={updating}
      onSource={noop}
      onSaveKey={noop}
      onRemoveKey={noop}
      onUpdateReader={noop}
    />,
  )

const button = (html: string, label: string) =>
  [...html.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map(([b]) => b).find((b) => b.includes(label))

describe('Ajustes → YouTube', () => {
  it('says which reader is in use and its version, with «Actualizar el lector»', () => {
    const html = render(settings())
    expect(html).toContain(text.inUse.ytdlp)
    expect(html).toContain('2026.08.19')
    expect(button(html, text.updateReader)).toBeTruthy()
  })

  it('the key lives in «Modo experto»; once saved only its hint shows', () => {
    const html = render(settings({ apiKey: { set: true, hint: 'wxyz', rejected: false } }))
    expect(html).toContain(text.expert)
    expect(html).toContain('••••wxyz')
    expect(button(html, text.removeKey)).toBeTruthy()
  })

  it('a key YouTube stopped taking is said in plain words (P15 a)', () => {
    const html = render(settings({ apiKey: { set: true, hint: 'wxyz', rejected: true } }))
    expect(html).toContain(text.keyRejected)
    expect(render(settings({ apiKey: { set: true, hint: 'wxyz', rejected: false } }))).not.toContain(text.keyRejected)
  })

  it('the units of the day, and a warning past 80 % (FR-030)', () => {
    const near = render(settings({ quota: { used: 8200, limit: 10_000, nearLimit: true } }))
    expect(near).toContain(text.quotaNear)
    const far = render(settings({ quota: { used: 100, limit: 10_000, nearLimit: false } }))
    expect(far).not.toContain(text.quotaNear)
    expect(far).toContain('100')
  })

  it('without the reader installed it says so', () => {
    expect(render(settings({ ytdlpVersion: null }))).toContain(text.noReader)
  })

  it('no technical names on screen', () => {
    const html = render(settings({ quota: { used: 100, limit: 10_000, nearLimit: false } }))
    for (const term of ['yt-dlp', 'Data API', 'API key', 'URL']) expect(html).not.toContain(term)
  })
})

describe('Ajustes → Consumo', () => {
  const usage: UsageList = {
    items: [
      {
        id: 'u1',
        journeyId: 'j1',
        use: 'nichos',
        providerId: 'anthropic',
        model: 'claude-haiku-5-5',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCents: 4,
        costCents: 3,
        pricingVersion: 1,
        outcome: 'ok',
        createdAt: '2026-11-05T09:00:00.000Z',
      },
    ],
    todayCents: 3,
    monthCents: 125,
  }

  it('the totals of today and the month, and each call with its use and amount', () => {
    const html = renderToStaticMarkup(<UsageLogView usage={usage} />)
    expect(html).toContain('0,03')
    expect(html).toContain('1,25')
    expect(html).toContain(es.usage.uses.nichos)
  })

  it('with no calls it says so', () => {
    const html = renderToStaticMarkup(<UsageLogView usage={{ items: [], todayCents: 0, monthCents: 0 }} />)
    expect(html).toContain(es.usage.empty)
  })

  it('lists what YTCreator knows that was reviewed more than 180 days ago', () => {
    const files = [
      { id: 'rpm', label: 'Ganancias por nicho', reviewedAt: '2026-01-01', stale: true },
      { id: 'ypp', label: 'Programa de socios de YouTube', reviewedAt: '2026-10-01', stale: false },
    ]
    const html = renderToStaticMarkup(<KnowledgeAge files={files} />)
    expect(html).toContain('Ganancias por nicho')
    expect(html).not.toContain('Programa de socios de YouTube')
    expect(renderToStaticMarkup(<KnowledgeAge files={[files[1]!]} />)).toBe('')
  })
})
