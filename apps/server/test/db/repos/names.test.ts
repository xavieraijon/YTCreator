import { beforeEach, describe, expect, it } from 'vitest'
import { createNamesRepo, type NamesRepo } from '../../../src/db/repos/names.ts'
import { freshDb, manualClock, seedJourney } from './helpers.ts'

describe('names repo', () => {
  let names: NamesRepo
  let journeyId: string
  const clock = manualClock()

  beforeEach(() => {
    const db = freshDb()
    journeyId = seedJourney(db).journeyId
    names = createNamesRepo(db, clock.now)
  })

  it('records a check with its reasons and similar channels', () => {
    const check = names.record({
      journeyId,
      displayName: 'Sobras con Arte',
      handle: 'sobrasconarte',
      origin: 'ia',
      semaphore: 'ambar',
      reasons: ['parecidos'],
      handleStatus: 'libre',
      similarChannels: [{ title: 'Sobras y Arte', handle: 'sobrasyarte', subscribers: 1200 }],
      titleHits: 1,
    })
    expect(check).toMatchObject({
      semaphore: 'ambar',
      reasons: ['parecidos'],
      handleStatus: 'libre',
      similarChannels: [{ title: 'Sobras y Arte', handle: 'sobrasyarte', subscribers: 1200 }],
      checkedAt: clock.now().toISOString(),
    })
  })

  it('a failed check is stored as not checked, never green', () => {
    const check = names.record({
      journeyId,
      displayName: 'X',
      handle: 'xxx',
      origin: 'creador',
      semaphore: 'sin_comprobar',
      reasons: ['fallo'],
      handleStatus: 'sin_comprobar',
      similarChannels: [],
      titleHits: null,
    })
    expect(check).toMatchObject({ semaphore: 'sin_comprobar', titleHits: null })
  })

  it('lists the checks of a journey, newest per handle last', () => {
    const base = {
      journeyId,
      displayName: 'Uno',
      origin: 'ia',
      semaphore: 'verde',
      reasons: [],
      handleStatus: 'libre',
      similarChannels: [],
      titleHits: 0,
    } as const
    names.record({ ...base, handle: 'uno' })
    names.record({ ...base, handle: 'dos', displayName: 'Dos' })
    expect(names.listByJourney(journeyId).map((c) => c.handle)).toEqual(['uno', 'dos'])
  })
})
