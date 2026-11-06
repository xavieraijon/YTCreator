import type { ChannelCurrent, JourneyFullView, ProposalView } from '@ytcreator/core/api'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ChannelUrlView } from '../../src/screens/channel/existing/ChannelUrl.tsx'
import { cadenceLines, counted, overHours } from '../../src/screens/channel/new/Concepts.tsx'
import { NameCard } from '../../src/screens/channel/new/Names.tsx'
import { chosenName } from '../../src/screens/channel/profile/NamePanel.tsx'
import { StartView } from '../../src/screens/channel/start/Start.tsx'
import { YouTubeSettingsView } from '../../src/screens/settings/YouTubeSettings.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'
import { es } from '../../src/strings/es.ts'

// What the novice audit of 003 found and was fixed (T127, entries 136 and 137).
const noop = () => undefined
const rhythm = { hoursPerLongVideo: 4, hoursPerShort: 1 }

describe('the rhythm says what it needs apart from what the creator has (M2, minor 16)', () => {
  it('in singular for 1 and in plural for the rest', () => {
    expect(counted(1, channelEs.concepts.cadenceLong)).toBe('1 vídeo largo')
    expect(counted(2, channelEs.concepts.cadenceLong)).toBe('2 vídeos largos')
    expect(counted(1, channelEs.concepts.cadenceShorts)).toBe('1 Short')
    expect(counted(1, channelEs.concepts.hours)).toBe('1 hora')
  })

  it('the hours the videos take and the ones the creator has, each with its name', () => {
    expect(cadenceLines({ longPerWeek: 1, shortsPerWeek: 1, hoursPerWeek: 5 }, rhythm)).toEqual([
      '1 vídeo largo y 1 Short por semana.',
      'Este ritmo pide unas 5 horas a la semana. Tú tienes 5 horas.',
      // P7 (entry 142): the hours per video are ours, and it says so.
      'Es una estimación nuestra: unas 4 horas por vídeo largo y 1 hora por Short.',
    ])
    expect(cadenceLines({ longPerWeek: 2, shortsPerWeek: 3, hoursPerWeek: 5 }, undefined)).toEqual([
      '2 vídeos largos y 3 Shorts por semana.',
      'Tú tienes 5 horas a la semana.',
    ])
  })
})

describe('the name changes from «Tu canal» (M3)', () => {
  const proposal = (changes: Partial<ProposalView>) =>
    ({
      id: 'p1',
      kind: 'nombres',
      status: 'aprobada',
      selectedIndex: 1,
      payload: {
        names: [
          { displayName: 'Uno', handle: 'uno', why: 'a' },
          { displayName: 'Dos', handle: 'dos', why: 'b' },
        ],
      },
      editedPayload: null,
      ...changes,
    }) as ProposalView
  const view = (proposals: ProposalView[]) =>
    ({
      proposals,
      nameChecks: [{ id: 'k1', displayName: 'Dos', handle: 'dos' }],
    }) as unknown as JourneyFullView

  it('takes the name chosen, with the check of its @', () => {
    expect(chosenName(view([proposal({})]))).toEqual({
      name: { displayName: 'Dos', handle: 'dos', why: 'b' },
      checkId: 'k1',
    })
    expect(chosenName(view([proposal({ selectedIndex: 0 })]))?.checkId).toBeNull()
  })

  it('with nothing chosen there is nothing to save', () => {
    expect(chosenName(view([]))).toBeNull()
    expect(chosenName(view([proposal({ status: 'propuesta', selectedIndex: null })]))).toBeNull()
  })
})

describe('one channel in this version, said before choosing (M6)', () => {
  it('the start says so next to the two ways', () => {
    const current = { channel: null, profile: null, journey: null } as unknown as ChannelCurrent
    const html = renderToStaticMarkup(
      <StartView current={current} onCreate={noop} onResume={noop} onChooseName={noop} />,
    )
    expect(html).toContain(channelEs.start.oneChannel)
  })
})

describe('Ajustes → YouTube does not say it reads with a reader that is not ready (M5)', () => {
  const render = (ytdlpVersion: string | null) =>
    renderToStaticMarkup(
      <YouTubeSettingsView
        settings={{
          source: 'auto',
          effectiveSource: 'ytdlp',
          ytdlpVersion,
          apiKey: { set: false, hint: null, rejected: false },
        }}
        updating={false}
        onSource={noop}
        onSaveKey={noop}
        onRemoveKey={noop}
        onUpdateReader={noop}
      />,
    )

  it('without the reader, it says it will read once it is prepared', () => {
    const html = render(null)
    expect(html).toContain(es.youtubeSettings.inUseNoReader)
    expect(html).not.toContain(es.youtubeSettings.inUse.ytdlp)
  })

  it('with the reader, it says it reads with it', () => {
    expect(render('2026.08.19')).toContain(es.youtubeSettings.inUse.ytdlp)
  })
})

describe('round 2 of the audit', () => {
  it('a rhythm that does not fit is known before choosing it (M1)', () => {
    const figures = (codes: string[]) =>
      ({ figures: { warnings: codes.map((code) => ({ code, sourceLabel: null, reviewedAt: null })) } }) as never
    expect(overHours(figures(['ritmo_insostenible']))).toBe(true)
    expect(overHours(figures(['solo_shorts']))).toBe(false)
  })

  it('the search of a channel says where to see the @ (M4)', () => {
    const html = renderToStaticMarkup(<ChannelUrlView value="" onChange={noop} onSubmit={noop} />)
    expect(html).toContain(channelEs.existing.url.find)
    for (const step of channelEs.existing.url.findSteps) expect(html).toContain(step)
  })
})

describe('round 3 of the audit: the name panel says which is the name now', () => {
  const name = { displayName: 'Barro y Torno', handle: 'barroytorno', why: 'a' }
  const check = { semaphore: 'verde', reasons: [], checkedAt: '2026-11-06T10:00:00.000Z' } as never
  const text = channelEs.profile.namePanel

  it('the current one has nothing to choose', () => {
    const html = renderToStaticMarkup(
      <NameCard name={name} check={check} onChoose={noop} onRetry={noop} currentLabel={text.current} />,
    )
    expect(html).toContain(text.current)
    expect(html).not.toContain(channelEs.names.choose)
  })

  it('another one chosen is not in use until «Usar este nombre»', () => {
    const html = renderToStaticMarkup(
      <NameCard
        name={name}
        check={check}
        chosen
        onChoose={noop}
        onRetry={noop}
        chosenLabel={text.chosen}
        next={{ label: text.finish, busy: false, onClick: noop }}
      />,
    )
    expect(html).toContain(text.chosen)
    expect(html).toContain(text.finish)
  })
})
