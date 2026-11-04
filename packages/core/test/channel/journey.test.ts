import { describe, expect, it } from 'vitest'
import { type ApprovalState, initialStep, journeyStateSchema, planStep, stepsOf } from '../../src/channel/journey.ts'

const none: ApprovalState = {}
const allNew: ApprovalState = {
  interests: true,
  questions: true,
  niche: true,
  rhythm: true,
  concept: true,
  name: true,
}
const allExisting: ApprovalState = { channelInput: true, channelConfirmed: true, reading: true, positioning: true }

describe('journey steps', () => {
  it('lists the steps of each journey in order', () => {
    expect(stepsOf('nuevo')).toEqual(['intereses', 'preguntas', 'nichos', 'ritmo', 'conceptos', 'nombres', 'hecho'])
    expect(stepsOf('existente')).toEqual(['enlace', 'confirmar', 'lectura', 'posicionamiento', 'hecho'])
    expect(initialStep('nuevo')).toBe('intereses')
    expect(initialStep('existente')).toBe('enlace')
  })

  it.each([
    ['intereses', 'preguntas'],
    ['preguntas', 'nichos'],
    ['nichos', 'ritmo'],
    ['ritmo', 'conceptos'],
    ['conceptos', 'nombres'],
    ['nombres', 'hecho'],
  ] as const)('new channel: %s → %s with its approval', (from, to) => {
    expect(planStep({ kind: 'nuevo', from, to, approvals: allNew })).toEqual({ ok: true, needsReview: false })
  })

  it.each([
    ['enlace', 'confirmar'],
    ['confirmar', 'lectura'],
    ['lectura', 'posicionamiento'],
    ['posicionamiento', 'hecho'],
  ] as const)('existing channel: %s → %s with its approval', (from, to) => {
    expect(planStep({ kind: 'existente', from, to, approvals: allExisting })).toEqual({ ok: true, needsReview: false })
  })

  it('moving forward without the approval of the current step fails', () => {
    expect(planStep({ kind: 'nuevo', from: 'nichos', to: 'ritmo', approvals: none })).toEqual({
      ok: false,
      reason: 'sin_aprobar',
    })
  })

  it('skipping a step fails even with every approval', () => {
    expect(planStep({ kind: 'nuevo', from: 'intereses', to: 'nichos', approvals: allNew })).toEqual({
      ok: false,
      reason: 'salto_no_permitido',
    })
  })

  it('a step of the other journey is not valid', () => {
    expect(planStep({ kind: 'nuevo', from: 'intereses', to: 'enlace', approvals: allNew })).toEqual({
      ok: false,
      reason: 'salto_no_permitido',
    })
  })

  it('«Decidir más tarde» leaves the names step without a chosen name (FR-018b)', () => {
    expect(
      planStep({ kind: 'nuevo', from: 'nombres', to: 'hecho', approvals: { ...allNew, name: false }, nameLater: true }),
    ).toEqual({ ok: true, needsReview: false })
    expect(planStep({ kind: 'nuevo', from: 'nombres', to: 'hecho', approvals: { ...allNew, name: false } })).toEqual({
      ok: false,
      reason: 'sin_aprobar',
    })
  })

  it('going back is allowed without approvals and keeps what was approved later (FR-002)', () => {
    expect(planStep({ kind: 'nuevo', from: 'ritmo', to: 'preguntas', approvals: none })).toEqual({
      ok: true,
      needsReview: false,
    })
  })

  it('going back to nichos with an approved concept asks to confirm and marks it for review (FR-025)', () => {
    const back = { kind: 'nuevo', from: 'nombres', to: 'nichos', approvals: allNew } as const
    expect(planStep(back)).toEqual({ ok: false, reason: 'requiere_confirmar' })
    expect(planStep({ ...back, confirm: true })).toEqual({ ok: true, needsReview: true })
  })

  it('going back to nichos with no approved concept needs no confirmation', () => {
    expect(planStep({ kind: 'nuevo', from: 'ritmo', to: 'nichos', approvals: { ...allNew, concept: false } })).toEqual({
      ok: true,
      needsReview: false,
    })
  })

  it('a finished journey does not move', () => {
    expect(planStep({ kind: 'nuevo', from: 'hecho', to: 'nombres', approvals: allNew })).toEqual({
      ok: false,
      reason: 'salto_no_permitido',
    })
  })
})

describe('journeyStateSchema', () => {
  const valid = (state: unknown) => journeyStateSchema.safeParse(state).success

  it('every field is optional until its step', () => {
    expect(valid({})).toBe(true)
  })

  it('interests: 10 to 1.000 characters', () => {
    expect(valid({ interests: 'corto' })).toBe(false)
    expect(valid({ interests: 'a'.repeat(10) })).toBe(true)
    expect(valid({ interests: 'a'.repeat(1000) })).toBe(true)
    expect(valid({ interests: 'a'.repeat(1001) })).toBe(false)
  })

  it('answers: up to 3', () => {
    const answer = { questionId: 'q', answer: 'sí' }
    expect(valid({ answers: [] })).toBe(true)
    expect(valid({ answers: [answer, answer, answer] })).toBe(true)
    expect(valid({ answers: [answer, answer, answer, answer] })).toBe(false)
  })

  it('hoursPerWeek: 1 to 60', () => {
    expect(valid({ hoursPerWeek: 0 })).toBe(false)
    expect(valid({ hoursPerWeek: 1 })).toBe(true)
    expect(valid({ hoursPerWeek: 60 })).toBe(true)
    expect(valid({ hoursPerWeek: 61 })).toBe(false)
  })

  it('onCamera and audienceRegion: closed lists', () => {
    expect(valid({ onCamera: 'voz', audienceRegion: 'latam' })).toBe(true)
    expect(valid({ onCamera: 'dron' })).toBe(false)
    expect(valid({ audienceRegion: 'marte' })).toBe(false)
  })

  it('keeps the review mark of FR-025', () => {
    expect(journeyStateSchema.parse({ conceptNeedsReview: true })).toEqual({ conceptNeedsReview: true })
  })
})
