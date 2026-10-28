import { z } from 'zod'
import { CONNECTION_KINDS } from '../ai/capabilities.ts'

export const WIZARD_STEPS = ['bienvenida', 'elegir', 'conectar', 'limites', 'listo', 'completado'] as const
export type WizardStep = (typeof WIZARD_STEPS)[number]

export const connectionKindSchema = z.enum(CONNECTION_KINDS)

export const onboardingStateSchema = z.object({
  step: z.enum(WIZARD_STEPS),
  chosenKind: connectionKindSchema.nullable(),
  postponed: z.boolean(),
  revision: z.number().int().nonnegative(),
  completedAt: z.string().nullable(),
})
export type OnboardingState = z.infer<typeof onboardingStateSchema>

export const WIZARD_ACTIONS = ['continuar', 'volver', 'elegir', 'aplazar', 'retomar'] as const
export type WizardAction = (typeof WIZARD_ACTIONS)[number]

// `kind` is required with `elegir` and ignored otherwise.
export const stepBodySchema = z.discriminatedUnion('action', [
  z.object({
    expectedRevision: z.number().int().nonnegative(),
    action: z.literal('elegir'),
    kind: connectionKindSchema,
  }),
  z.object({
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum(['continuar', 'volver', 'aplazar', 'retomar']),
    kind: z
      .unknown()
      .optional()
      .transform(() => undefined),
  }),
])
export type StepBody = z.infer<typeof stepBodySchema>
