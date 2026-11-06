import { z } from 'zod'
import {
  AUDIENCE_REGIONS,
  type ChannelOrigin,
  EXISTING_CHANNEL_STEPS,
  type JourneyStep,
  NEW_CHANNEL_STEPS,
} from './model.ts'
import { CHANNEL_HANDLE_PATTERN } from '../youtube/handle.ts'

// The answers of the creator, step by step (data-model.md, `journey.state`). Every field is optional until its step.
export const ON_CAMERA = ['cara', 'voz', 'ninguna'] as const
export type OnCamera = (typeof ON_CAMERA)[number]

export const journeyStateSchema = z.object({
  interests: z.string().trim().min(10).max(1000).optional(),
  answers: z
    .array(z.object({ questionId: z.string().min(1), answer: z.string().trim().min(1).max(1000) }))
    .max(3)
    .optional(),
  hoursPerWeek: z.number().int().min(1).max(60).optional(),
  onCamera: z.enum(ON_CAMERA).optional(),
  audienceRegion: z.enum(AUDIENCE_REGIONS).optional(),
  channelInput: z.string().trim().min(1).max(500).optional(),
  resolvedChannelId: z.string().min(1).optional(),
  // FR-022: a new journey for a channel that already has its name and its @.
  keptName: z
    .object({ displayName: z.string().min(1).max(100), handle: z.string().regex(CHANNEL_HANDLE_PATTERN).nullable() })
    .optional(),
  // FR-025: the niche changed after the concept was approved.
  conceptNeedsReview: z.boolean().optional(),
})
export type JourneyState = z.infer<typeof journeyStateSchema>

// What the journey already has, worked out by the server from the state and the proposals.
export interface ApprovalState {
  interests?: boolean
  questions?: boolean
  niche?: boolean
  rhythm?: boolean
  concept?: boolean
  name?: boolean
  channelInput?: boolean
  channelConfirmed?: boolean
  reading?: boolean
  positioning?: boolean
}

// The approval each step needs before moving on.
const NEEDS: Partial<Record<JourneyStep, keyof ApprovalState>> = {
  intereses: 'interests',
  preguntas: 'questions',
  nichos: 'niche',
  ritmo: 'rhythm',
  conceptos: 'concept',
  nombres: 'name',
  enlace: 'channelInput',
  confirmar: 'channelConfirmed',
  lectura: 'reading',
  posicionamiento: 'positioning',
}

export const stepsOf = (kind: ChannelOrigin): readonly JourneyStep[] =>
  kind === 'nuevo' ? NEW_CHANNEL_STEPS : EXISTING_CHANNEL_STEPS

export const initialStep = (kind: ChannelOrigin): JourneyStep => stepsOf(kind)[0]!

export interface StepRequest {
  kind: ChannelOrigin
  from: JourneyStep
  to: JourneyStep
  approvals: ApprovalState
  confirm?: boolean
  nameLater?: boolean
}

export type StepFailure = 'sin_aprobar' | 'salto_no_permitido' | 'requiere_confirmar'
export type StepPlan = { ok: true; needsReview: boolean } | { ok: false; reason: StepFailure }

// Forward one step at a time with its approval; back to any earlier step, keeping what was approved after it.
export function planStep({ kind, from, to, approvals, confirm, nameLater }: StepRequest): StepPlan {
  const steps = stepsOf(kind)
  const fromIndex = steps.indexOf(from)
  const toIndex = steps.indexOf(to)
  // A channel that exists has no step to choose a name: only a new one comes back to it, to choose the name left for
  // later (FR-018b) or to change the one chosen (entry 116).
  if (kind === 'nuevo' && from === 'hecho' && to === 'nombres') {
    return { ok: true, needsReview: false }
  }
  if (fromIndex < 0 || toIndex < 0 || from === 'hecho') return { ok: false, reason: 'salto_no_permitido' }

  if (toIndex < fromIndex) {
    if (to === 'nichos' && approvals.concept) {
      return confirm ? { ok: true, needsReview: true } : { ok: false, reason: 'requiere_confirmar' }
    }
    return { ok: true, needsReview: false }
  }
  if (toIndex !== fromIndex + 1) return { ok: false, reason: 'salto_no_permitido' }

  const needed = NEEDS[from]
  const approved = needed !== undefined && approvals[needed] === true
  if (approved || (from === 'nombres' && nameLater)) return { ok: true, needsReview: false }
  return { ok: false, reason: 'sin_aprobar' }
}
