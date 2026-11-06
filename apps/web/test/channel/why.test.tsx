import { EXISTING_CHANNEL_STEPS, type JourneyStep, NEW_CHANNEL_STEPS } from '@ytcreator/core'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { findForbiddenTerms, forbiddenTerms } from '../../../../packages/ui/test/forbidden-terms.ts'
import { InterestsView } from '../../src/screens/channel/new/Interests.tsx'
import { RhythmView } from '../../src/screens/channel/new/Rhythm.tsx'
import { channelEs } from '../../src/strings/channel.es.ts'

// FR-004: every step says in one or two plain sentences why it matters. Each screen of both journeys, with the texts
// it binds and the file that shows them.
const screens: Record<
  'nuevo' | 'existente',
  Partial<Record<JourneyStep, { file: string; binds: string; why: string }>>
> = {
  nuevo: {
    intereses: { file: 'new/Interests.tsx', binds: 'channelEs.interests', why: channelEs.interests.why },
    preguntas: { file: 'new/Questions.tsx', binds: 'channelEs.questions', why: channelEs.questions.why },
    nichos: { file: 'new/Niches.tsx', binds: 'channelEs.niches', why: channelEs.niches.why },
    ritmo: { file: 'new/Rhythm.tsx', binds: 'channelEs.rhythm', why: channelEs.rhythm.why },
    conceptos: { file: 'new/Concepts.tsx', binds: 'channelEs.concepts', why: channelEs.concepts.why },
    nombres: { file: 'new/Names.tsx', binds: 'channelEs.names', why: channelEs.names.why },
    hecho: { file: 'profile/Profile.tsx', binds: 'channelEs.profile', why: channelEs.profile.why },
  },
  existente: {
    enlace: { file: 'existing/ChannelUrl.tsx', binds: 'channelEs.existing.url', why: channelEs.existing.url.why },
    confirmar: {
      file: 'existing/Confirm.tsx',
      binds: 'channelEs.existing.confirm',
      why: channelEs.existing.confirm.why,
    },
    lectura: {
      file: 'existing/Reading.tsx',
      binds: 'channelEs.existing.reading',
      why: channelEs.existing.reading.why,
    },
    ritmo: { file: 'new/Rhythm.tsx', binds: 'channelEs.rhythm', why: channelEs.rhythm.why },
    posicionamiento: {
      file: 'existing/Positioning.tsx',
      binds: 'channelEs.existing.positioning',
      why: channelEs.existing.positioning.why,
    },
    hecho: { file: 'profile/Profile.tsx', binds: 'channelEs.profile', why: channelEs.profile.why },
  },
}

const source = (file: string) => readFileSync(new URL(`../../src/screens/channel/${file}`, import.meta.url), 'utf8')
const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() !== '')

describe('every step says why it matters (FR-004)', () => {
  it.each([
    ['nuevo', NEW_CHANNEL_STEPS],
    ['existente', EXISTING_CHANNEL_STEPS],
  ] as const)('each step of the journey «%s» has its screen and its sentence', (kind, steps) => {
    for (const step of steps) expect(screens[kind][step], `${kind}/${step}`).toBeDefined()
  })

  const all = Object.entries(screens).flatMap(([kind, steps]) =>
    Object.entries(steps).map(([step, screen]) => [`${kind}/${step}`, screen] as const),
  )

  it.each(all)('%s: one or two short, plain sentences', (_, { why }) => {
    expect(sentences(why).length).toBeGreaterThanOrEqual(1)
    expect(sentences(why).length).toBeLessThanOrEqual(2)
    for (const sentence of sentences(why)) expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25)
    expect(findForbiddenTerms({ why }, forbiddenTerms)).toEqual([])
  })

  it.each(all)('%s: the screen shows it as its explanation', (_, { file, binds }) => {
    const code = source(file)
    expect(code).toContain(`const text = ${binds}\n`)
    expect(code).toMatch(/<p className=\{styles\.why\}>\{text\.why\}<\/p>/)
  })

  it('the screens that need no data show it when they are drawn', () => {
    const noop = () => undefined
    expect(renderToStaticMarkup(<InterestsView onNext={noop} />)).toContain(channelEs.interests.why)
    expect(renderToStaticMarkup(<RhythmView onNext={noop} />)).toContain(channelEs.rhythm.why)
  })
})
