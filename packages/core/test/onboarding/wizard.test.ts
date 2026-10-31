import { describe, expect, it } from 'vitest'
import type { OnboardingState, WizardStep } from '../../src/api/onboarding.ts'
import { transition, type WizardContext, type WizardInput } from '../../src/onboarding/wizard.ts'

const NOW = new Date('2026-10-29T10:00:00.000Z')
const READY: WizardContext = { connected: true, hasLimits: true, now: NOW }

function state(step: WizardStep, changes: Partial<OnboardingState> = {}): OnboardingState {
  return { step, chosenKind: null, postponed: false, revision: 3, completedAt: null, ...changes }
}

function act(action: WizardInput['action'], kind?: WizardInput['kind']): WizardInput {
  return { action, kind, expectedRevision: 3 } as WizardInput
}

describe('wizard transition (data-model.md, «Estado del asistente»)', () => {
  it('continues from bienvenida to elegir', () => {
    expect(transition(state('bienvenida'), act('continuar'), READY)).toEqual({
      ok: true,
      state: state('elegir', { revision: 4 }),
      activate: null,
    })
  })

  it('chooses a kind and moves to conectar', () => {
    const result = transition(state('elegir'), act('elegir', 'pago_por_uso'), READY)
    expect(result).toMatchObject({ ok: true, state: { step: 'conectar', chosenKind: 'pago_por_uso' } })
  })

  it('refuses elegir outside its step or without a kind', () => {
    expect(transition(state('bienvenida'), act('elegir', 'suscripcion'), READY)).toEqual({
      ok: false,
      code: 'validacion',
    })
    expect(transition(state('elegir'), act('elegir'), READY)).toEqual({ ok: false, code: 'validacion' })
  })

  it('goes from conectar to listo with a subscription, activating it in the same step', () => {
    const result = transition(state('conectar', { chosenKind: 'suscripcion' }), act('continuar'), READY)
    expect(result).toMatchObject({ ok: true, state: { step: 'listo' }, activate: 'suscripcion' })
  })

  it('goes from conectar to limites with pago_por_uso, without activating it', () => {
    const result = transition(state('conectar', { chosenKind: 'pago_por_uso' }), act('continuar'), READY)
    expect(result).toMatchObject({ ok: true, state: { step: 'limites' }, activate: null })
  })

  it('needs a connected connection to leave conectar', () => {
    for (const kind of ['suscripcion', 'pago_por_uso'] as const) {
      const result = transition(state('conectar', { chosenKind: kind }), act('continuar'), {
        ...READY,
        connected: false,
      })
      expect(result).toEqual({ ok: false, code: 'validacion', guard: 'sin_conexion' })
    }
  })

  it('needs the limits to leave limites, and only then activates pago_por_uso', () => {
    const limits = state('limites', { chosenKind: 'pago_por_uso' })
    expect(transition(limits, act('continuar'), { ...READY, hasLimits: false })).toEqual({
      ok: false,
      code: 'validacion',
      guard: 'sin_limites',
    })
    expect(transition(limits, act('continuar'), READY)).toMatchObject({
      ok: true,
      state: { step: 'listo' },
      activate: 'pago_por_uso',
    })
  })

  it('never activates pago_por_uso without limits, whatever the step and action', () => {
    const steps: WizardStep[] = ['bienvenida', 'elegir', 'conectar', 'limites', 'listo', 'completado']
    const actions = ['continuar', 'volver', 'aplazar', 'retomar'] as const
    for (const step of steps) {
      for (const action of actions) {
        for (const postponed of [false, true]) {
          const result = transition(state(step, { chosenKind: 'pago_por_uso', postponed }), act(action), {
            ...READY,
            hasLimits: false,
          })
          if (result.ok) expect(result.activate).toBeNull()
        }
      }
    }
  })

  it('completes from listo with the completion date', () => {
    const result = transition(state('listo', { chosenKind: 'suscripcion' }), act('continuar'), READY)
    expect(result).toMatchObject({ ok: true, state: { step: 'completado', completedAt: NOW.toISOString() } })
  })

  it('goes back one step', () => {
    const cases: [WizardStep, WizardStep][] = [
      ['elegir', 'bienvenida'],
      ['conectar', 'elegir'],
      ['limites', 'conectar'],
    ]
    for (const [from, to] of cases) {
      expect(transition(state(from, { chosenKind: 'pago_por_uso' }), act('volver'), READY)).toMatchObject({
        ok: true,
        state: { step: to },
      })
    }
  })

  it('goes back from listo to limites with pago_por_uso and to conectar without limits', () => {
    expect(transition(state('listo', { chosenKind: 'pago_por_uso' }), act('volver'), READY)).toMatchObject({
      state: { step: 'limites' },
    })
    expect(transition(state('listo', { chosenKind: 'suscripcion' }), act('volver'), READY)).toMatchObject({
      state: { step: 'conectar' },
    })
  })

  it('cannot go back from bienvenida nor move after completado', () => {
    expect(transition(state('bienvenida'), act('volver'), READY)).toEqual({ ok: false, code: 'validacion' })
    for (const action of ['continuar', 'volver', 'aplazar'] as const) {
      expect(transition(state('completado'), act(action), READY)).toEqual({ ok: false, code: 'validacion' })
    }
  })

  it('postpones from any step except completado and resumes on the same step', () => {
    for (const step of ['bienvenida', 'elegir', 'conectar', 'limites', 'listo'] as WizardStep[]) {
      const postponed = transition(state(step), act('aplazar'), READY)
      expect(postponed).toMatchObject({ ok: true, state: { step, postponed: true, revision: 4 } })
      if (!postponed.ok) continue
      const resumed = transition(postponed.state, { action: 'retomar', expectedRevision: 4 } as WizardInput, READY)
      expect(resumed).toMatchObject({ ok: true, state: { step, postponed: false, revision: 5 } })
    }
  })

  it('only accepts retomar while postponed, and retomar only then', () => {
    expect(transition(state('elegir'), act('retomar'), READY)).toEqual({ ok: false, code: 'validacion' })
    expect(transition(state('bienvenida', { postponed: true }), act('continuar'), READY)).toEqual({
      ok: false,
      code: 'validacion',
    })
  })

  it('answers conflicto with the current state when the revision is stale', () => {
    const current = state('conectar', { chosenKind: 'suscripcion' })
    expect(transition(current, { action: 'continuar', expectedRevision: 2 } as WizardInput, READY)).toEqual({
      ok: false,
      code: 'conflicto',
      current,
    })
  })

  it('raises the revision by exactly one on every valid action', () => {
    const result = transition(state('bienvenida', { revision: 3 }), act('continuar'), READY)
    expect(result.ok && result.state.revision).toBe(4)
  })
})
