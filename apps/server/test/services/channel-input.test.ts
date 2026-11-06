import { describe, expect, it } from 'vitest'
import type { Journey } from '../../src/db/repos/journeys.ts'
import type { Measure } from '../../src/db/repos/measures.ts'
import { channelInput, previousOf } from '../../src/services/channel-input.ts'
import { createConcepts } from '../../src/services/concepts.ts'

const measure = (source: Measure['source']) =>
  ({
    id: 'm',
    nicheLabel: 'Cocina',
    status: 'medida',
    source,
    recentVideos: 3,
    sampleSize: 30,
    unreadChannels: 9,
  }) as Measure
const journey = { id: 'j', state: { interests: 'cocinar' } } as unknown as Journey
const input = (source: Measure['source']) =>
  channelInput('recomendacion', journey, {} as never, { listByJourney: () => [measure(source)] }) as {
    niches: Record<string, unknown>[]
  }

describe('what the AI reads about how recent a niche is', () => {
  it('with the Data API, the count: all the videos have a date', () => {
    expect(input('data_api').niches[0]).toMatchObject({ recentVideos: 3 })
  })

  it('without a key, nothing: only the newest videos of each channel have a date, the count would mislead', () => {
    expect(input('ytdlp').niches[0]).not.toHaveProperty('recentVideos')
  })
})

describe('what the AI reads in the concepts', () => {
  const inputOf = (source: Measure['source']) =>
    createConcepts({
      measures: { listByJourney: () => [measure(source)], listReferences: () => [] },
      knowledge: { forPrompt: {} },
      warningKnowledge: {},
      sourceLabel: () => null,
    } as never).input(journey, { niche: { label: 'Cocina' } }) as { measure: Record<string, unknown> }

  it('the same goes for the recent videos', () => {
    expect(inputOf('data_api').measure).toMatchObject({ recentVideos: 3 })
    expect(inputOf('ytdlp').measure).not.toHaveProperty('recentVideos')
  })
})

describe('what the AI reads of the concept when it proposes names', () => {
  const proposals = (concept: Record<string, unknown>) =>
    ({
      latest: () => ({ status: 'aprobada', selectedIndex: 0, payload: { concepts: [concept] }, editedPayload: null }),
    }) as never
  const written = { promise: 'Cenas', audience: { description: 'Gente', region: 'espana' }, figures: { any: 1 } }
  const atLatam = { id: 'j', state: { audienceRegion: 'latam' } } as unknown as Journey

  it('the region of the journey, or the one set by hand, and none of what is not its business', () => {
    const followed = channelInput('nombres', atLatam, proposals(written), { listByJourney: () => [] })
    expect(followed).toEqual({ concept: { promise: 'Cenas', audience: { description: 'Gente', region: 'latam' } } })
    const byHand = channelInput('nombres', atLatam, proposals({ ...written, regionByHand: true }), {
      listByJourney: () => [],
    })
    expect(byHand).toEqual({ concept: { promise: 'Cenas', audience: { description: 'Gente', region: 'espana' } } })
  })
})

describe('what the AI reads of the proposal it redoes', () => {
  it('no money figures: they may be out of date, and they would count as a source for what it writes', () => {
    const payload = {
      concepts: [
        { promise: 'Cenas', figures: { monetization: { monthlyEurRange: { max: 400 } } }, regionByHand: true },
      ],
      basedOn: { nicheLabel: 'A', region: 'espana' },
      stale: true,
    }
    expect(previousOf(payload)).toEqual({ concepts: [{ promise: 'Cenas' }] })
  })

  it('other proposals go as they are', () => {
    const names = { names: [{ displayName: 'Canal' }] }
    expect(previousOf(names)).toBe(names)
  })
})
