import type { ConnectionKind } from '../ai/capabilities.ts'
import type { OnboardingState, StepBody, WizardStep } from '../api/onboarding.ts'

// What the machine needs to know about the rest (data-model.md, «Estado del asistente»).
export interface WizardContext {
  // The connection of `chosenKind` exists and is `conectada`.
  connected: boolean
  hasLimits: boolean
  now: Date
}

export type WizardInput = Pick<StepBody, 'action' | 'kind' | 'expectedRevision'>

export type TransitionResult =
  // `activate`: the connection the server must activate in the same transaction as the step.
  | { ok: true; state: OnboardingState; activate: ConnectionKind | null }
  | { ok: false; code: 'conflicto'; current: OnboardingState }
  | { ok: false; code: 'validacion'; guard?: 'sin_conexion' | 'sin_limites' }

const PREVIOUS: Partial<Record<WizardStep, WizardStep>> = {
  elegir: 'bienvenida',
  conectar: 'elegir',
  limites: 'conectar',
}

const INVALID: TransitionResult = { ok: false, code: 'validacion' }

// Pure wizard machine (R18). Every valid action raises `revision` by one.
export function transition(state: OnboardingState, input: WizardInput, context: WizardContext): TransitionResult {
  if (input.expectedRevision !== state.revision) return { ok: false, code: 'conflicto', current: state }

  const next = (changes: Partial<OnboardingState>, activate: ConnectionKind | null = null): TransitionResult => ({
    ok: true,
    state: { ...state, ...changes, revision: state.revision + 1 },
    activate,
  })

  if (input.action === 'retomar') return state.postponed ? next({ postponed: false }) : INVALID
  if (state.step === 'completado') return INVALID
  if (input.action === 'aplazar') return next({ postponed: true })
  // While postponed the web shows /conectar-ia: only `retomar` brings the wizard back.
  if (state.postponed) return INVALID

  switch (input.action) {
    case 'elegir':
      return state.step === 'elegir' && input.kind ? next({ step: 'conectar', chosenKind: input.kind }) : INVALID

    case 'volver': {
      if (state.step === 'listo') return next({ step: state.chosenKind === 'pago_por_uso' ? 'limites' : 'conectar' })
      const previous = PREVIOUS[state.step]
      return previous ? next({ step: previous }) : INVALID
    }

    case 'continuar':
      switch (state.step) {
        case 'bienvenida':
          return next({ step: 'elegir' })
        case 'conectar':
          if (!state.chosenKind) return INVALID
          if (!context.connected) return { ok: false, code: 'validacion', guard: 'sin_conexion' }
          if (state.chosenKind === 'pago_por_uso') return next({ step: 'limites' })
          return next({ step: 'listo' }, state.chosenKind)
        case 'limites':
          // Activating here, with the limits in place, is what keeps pago_por_uso from ever being active without them.
          if (!context.hasLimits) return { ok: false, code: 'validacion', guard: 'sin_limites' }
          if (!context.connected) return { ok: false, code: 'validacion', guard: 'sin_conexion' }
          return next({ step: 'listo' }, state.chosenKind)
        case 'listo':
          return next({ step: 'completado', completedAt: context.now.toISOString() })
        default:
          return INVALID
      }
  }
}
