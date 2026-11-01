import { beforeEach, describe, expect, it } from 'vitest'
import { createChannelsRepo } from '../../../src/db/repos/channels.ts'
import { createJourneysRepo, type JourneysRepo } from '../../../src/db/repos/journeys.ts'
import { freshDb } from './helpers.ts'

describe('journeys repo', () => {
  let journeys: JourneysRepo
  let channelId: string

  beforeEach(() => {
    const db = freshDb()
    channelId = createChannelsRepo(db).create({ origin: 'nuevo' }).id
    journeys = createJourneysRepo(db)
  })

  it('creates an active journey at revision 0 with empty state', () => {
    const journey = journeys.create({ channelId, kind: 'nuevo', step: 'intereses' })
    expect(journey).toMatchObject({ kind: 'nuevo', step: 'intereses', status: 'activo', state: {}, revision: 0 })
    expect(journeys.getActive(channelId)?.id).toBe(journey.id)
  })

  it('allows only one active journey per channel', () => {
    journeys.create({ channelId, kind: 'nuevo', step: 'intereses' })
    expect(() => journeys.create({ channelId, kind: 'nuevo', step: 'intereses' })).toThrow('recorrido_activo')
  })

  it('allows a new journey once the previous one is finished', () => {
    const first = journeys.create({ channelId, kind: 'nuevo', step: 'intereses' })
    journeys.update(first.id, 0, { status: 'terminado' })
    expect(journeys.create({ channelId, kind: 'nuevo', step: 'intereses' }).status).toBe('activo')
  })

  it('bumps the revision on every update', () => {
    const journey = journeys.create({ channelId, kind: 'nuevo', step: 'intereses' })
    const result = journeys.update(journey.id, 0, { step: 'preguntas', state: { interests: 'cocina' } })
    expect(result).toMatchObject({ ok: true, journey: { step: 'preguntas', revision: 1, state: { interests: 'cocina' } } })
  })

  it('returns conflicto with the current journey when the revision is stale', () => {
    const journey = journeys.create({ channelId, kind: 'nuevo', step: 'intereses' })
    journeys.update(journey.id, 0, { step: 'preguntas' })
    const stale = journeys.update(journey.id, 0, { step: 'nichos' })
    expect(stale).toMatchObject({ ok: false, conflict: true, current: { step: 'preguntas', revision: 1 } })
  })

  it('returns null for an unknown journey', () => {
    expect(journeys.get('nope')).toBeNull()
    expect(journeys.update('nope', 0, { step: 'preguntas' })).toBeNull()
  })
})
