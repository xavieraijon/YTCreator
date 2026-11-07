import { z } from 'zod'
import { IDEA_LIMITS, ideaDraftSchema, searchTextSchema } from './model.ts'

// Output schemas of the three idea uses (specs/004-idea-bank/contracts/ai-uses.md).
export const ideasOutput = z.object({ ideas: z.array(ideaDraftSchema).min(6).max(10) })

// An opinion: it may say why the angle is different, never that it «tiene hueco» (only a measure says that).
const angleWhy = z
  .string()
  .trim()
  .min(1)
  .max(IDEA_LIMITS.hook)
  .refine((text) => !/tiene\s+hueco|hay\s+hueco/i.test(text), 'sin_veredicto')
export const anglesOutput = z.object({
  angles: z
    .array(ideaDraftSchema.extend({ why: angleWhy }))
    .min(2)
    .max(3),
})

export const ideaQueriesOutput = z.object({
  query: searchTextSchema,
  broadQuery: searchTextSchema,
  queryEn: searchTextSchema,
})

export type IdeasOutput = z.infer<typeof ideasOutput>
export type AnglesOutput = z.infer<typeof anglesOutput>
export type IdeaQueriesOutput = z.infer<typeof ideaQueriesOutput>

const samePillar = (pillars: readonly string[]) => {
  const known = new Set(pillars.map((p) => p.trim().toLocaleLowerCase('es')))
  return (pillar: string) => known.has(pillar.trim().toLocaleLowerCase('es'))
}

// The pillar has to be one of the profile's, ignoring case: otherwise the output does not validate (ai-uses.md).
export function ideasOutputFor(pillars: readonly string[]) {
  const ok = samePillar(pillars)
  return ideasOutput.refine((out) => out.ideas.every((idea) => ok(idea.pillar)), {
    message: 'pilar_desconocido',
    path: ['ideas'],
  })
}

export function anglesOutputFor(pillars: readonly string[]) {
  const ok = samePillar(pillars)
  return anglesOutput.refine((out) => out.angles.every((angle) => ok(angle.pillar)), {
    message: 'pilar_desconocido',
    path: ['angles'],
  })
}

export const IDEA_OUTPUTS = {
  ideas: ideasOutput,
  otro_enfoque: anglesOutput,
  busquedas_idea: ideaQueriesOutput,
} as const
export type IdeaUse = keyof typeof IDEA_OUTPUTS
export const IDEA_USES = Object.keys(IDEA_OUTPUTS) as [IdeaUse, ...IdeaUse[]]
