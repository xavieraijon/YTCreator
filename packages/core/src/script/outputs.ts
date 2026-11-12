import { z } from 'zod'
import { IDEA_LIMITS } from '../ideas/model.ts'
import { durationSeconds } from './duration.ts'
import { CLAIM_VERDICTS, OUTLINE_BLOCK_TYPES, SCRIPT_LIMITS } from './model.ts'

// What the AI has to answer for each use of the script (specs/005-script-and-outline/contracts/ai-uses.md).
const hint = z.string().trim().max(SCRIPT_LIMITS.blockHint).nullable()

const outlineDraft = z.object({
  type: z.enum(OUTLINE_BLOCK_TYPES),
  title: z.string().trim().min(1).max(SCRIPT_LIMITS.blockTitle),
  purpose: z.string().trim().min(1).max(SCRIPT_LIMITS.blockPurpose),
  question: hint,
  reward: hint,
  bridge: hint,
  seconds: z.number().int().positive(),
})

// A hook first, a closing last, one context and at least two acts, or it is not an outline (ai-uses.md).
export const outlineOutput = z
  .object({ blocks: z.array(outlineDraft).min(4).max(SCRIPT_LIMITS.outlineBlocks) })
  .refine(
    ({ blocks }) => {
      const types = blocks.map((block) => block.type)
      return (
        types[0] === 'gancho' &&
        types.at(-1) === 'cierre' &&
        types.filter((type) => type === 'gancho').length === 1 &&
        types.filter((type) => type === 'cierre').length === 1 &&
        types.filter((type) => type === 'contexto').length === 1 &&
        types.filter((type) => type === 'acto').length >= 2
      )
    },
    { message: 'estructura_no_valida' },
  )
  // Each act opens a question, gives something back and leads to the next (FR-006).
  .refine(
    ({ blocks }) =>
      blocks.filter((block) => block.type === 'acto').every((act) => act.question && act.reward && act.bridge),
    { message: 'acto_incompleto' },
  )
export type OutlineOutput = z.infer<typeof outlineOutput>

const claimText = z.string().trim().min(1).max(SCRIPT_LIMITS.claimText)
const factId = z.string().min(1).nullable()
const spoken = z.string().trim().min(1).max(SCRIPT_LIMITS.blockText)
const visual = z.string().trim().max(SCRIPT_LIMITS.visual)

export const draftOutput = z.object({
  blocks: z
    .array(z.object({ outlineBlockId: z.string().min(1), text: spoken, visual }))
    .min(1)
    .max(SCRIPT_LIMITS.outlineBlocks),
  claims: z.array(z.object({ outlineBlockId: z.string().min(1), text: claimText, factId })),
})
export type DraftOutput = z.infer<typeof draftOutput>

// The same blocks of the outline, in its order, or it is not the script of that outline (ai-uses.md).
export const draftOutputFor = (outlineBlockIds: readonly string[]) =>
  draftOutput
    .refine(
      ({ blocks }) =>
        blocks.length === outlineBlockIds.length &&
        blocks.every((block, index) => block.outlineBlockId === outlineBlockIds[index]),
      { message: 'bloques_distintos' },
    )
    .refine(({ claims }) => claims.every((claim) => outlineBlockIds.includes(claim.outlineBlockId)), {
      message: 'marca_sin_bloque',
    })

export const blockOutput = z.object({
  text: spoken,
  visual,
  claims: z.array(z.object({ text: claimText, factId })),
})
export type BlockOutput = z.infer<typeof blockOutput>

const SHORT_PARTS = ['gancho', 'desarrollo', 'cierre'] as const

// Three parts, in this order, or it is not the script of a Short (ai-uses.md).
export const shortDraftOutput = z
  .object({
    blocks: z.array(z.object({ type: z.enum(SHORT_PARTS), text: spoken, visual })).length(3),
    claims: z.array(z.object({ type: z.enum(SHORT_PARTS), text: claimText, factId })),
  })
  .refine(({ blocks }) => blocks.every((block, index) => block.type === SHORT_PARTS[index]), {
    message: 'tramos_distintos',
  })
export type ShortDraftOutput = z.infer<typeof shortDraftOutput>

// The most a Short can last comes from whoever asks: `core` does not read the knowledge package.
export const shortDraftOutputFor = (maxSeconds: number, wordsPerMinute: number) =>
  shortDraftOutput.refine(
    ({ blocks }) => durationSeconds(blocks.map((block) => block.text).join(' '), wordsPerMinute) <= maxSeconds,
    { message: 'demasiado_largo' },
  )

// An address is checked by the server: one that does not parse costs that source, not the whole paid research.
const webSource = z.object({
  url: z.string().trim().min(1).max(SCRIPT_LIMITS.sourceUrl),
  title: z.string().trim().min(1).max(SCRIPT_LIMITS.sourceTitle),
})

export const RESEARCH_MAX_FACTS = 40

// An empty list is a valid answer: nothing reliable was found (ai-uses.md).
export const researchOutput = z.object({
  facts: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(SCRIPT_LIMITS.factText),
        label: z.enum(['comprobado', 'una_fuente', 'sin_confirmar']),
        sources: z.array(webSource).max(SCRIPT_LIMITS.factSources),
        alternatives: z.string().trim().max(SCRIPT_LIMITS.factText).nullable(),
      }),
    )
    .max(RESEARCH_MAX_FACTS),
})
export type ResearchOutput = z.infer<typeof researchOutput>

export const checkOutput = z.object({
  checks: z.array(
    z.object({
      claimId: z.string().min(1),
      verdict: z.enum(CLAIM_VERDICTS),
      sources: z.array(webSource).max(SCRIPT_LIMITS.factSources),
      proposal: claimText.nullable(),
    }),
  ),
})
export type CheckOutput = z.infer<typeof checkOutput>

// Only the claims that were asked about (ai-uses.md).
export const checkOutputFor = (claimIds: readonly string[]) =>
  checkOutput.refine(({ checks }) => checks.every((check) => claimIds.includes(check.claimId)), {
    message: 'marca_desconocida',
  })

const angleText = (max: number) => z.string().trim().min(1).max(max)

export const shortAngleSchema = z.object({
  title: angleText(IDEA_LIMITS.title),
  hook: angleText(IDEA_LIMITS.hook),
  blockId: z.string().min(1),
  why: angleText(IDEA_LIMITS.hook),
})
export type ShortAngle = z.infer<typeof shortAngleSchema>

export const shortAnglesSchema = z.array(shortAngleSchema)

// As kept: with the text it came from, because a change in the script leaves that angle out of date; whether a figure
// was taken out of it; and the Short it became, once chosen (decision 41).
export const storedShortAnglesSchema = z.array(
  shortAngleSchema.extend({
    moment: z.string(),
    trimmed: z.boolean().default(false),
    scriptId: z.string().nullable().default(null),
  }),
)
export type StoredShortAngle = z.infer<typeof storedShortAnglesSchema>[number]

// What the screen offers: each one with its place in what is kept, so choosing does not depend on what is hidden.
export const shortAngleViewSchema = shortAngleSchema.extend({
  index: z.number().int().nonnegative(),
  trimmed: z.boolean(),
  scriptId: z.string().nullable(),
})
export type ShortAngleView = z.infer<typeof shortAngleViewSchema>

/**
 * The angles still offered: those whose moment says, in the script as it is now, what it said when they were drawn.
 * Nothing is dropped from what is kept: an angle comes back if its text does (decision 41).
 */
export function liveShortAngles(
  stored: readonly (StoredShortAngle | null)[],
  blocks: readonly { id: string; text: string }[],
): ShortAngleView[] {
  // `null` is one kept that no longer reads: it keeps its place, so the others keep theirs.
  return stored.flatMap((angle, index) => {
    if (angle === null) return []
    const { title, hook, blockId, why, moment, trimmed, scriptId } = angle
    return blocks.find((block) => block.id === blockId)?.text === moment
      ? [{ title, hook, blockId, why, index, trimmed, scriptId }]
      : []
  })
}

export const shortAnglesOutput = z.object({ angles: shortAnglesSchema.min(2).max(3) })
export type ShortAnglesOutput = z.infer<typeof shortAnglesOutput>

// Each one comes from a moment that is really in the script (ai-uses.md).
export const shortAnglesOutputFor = (blockIds: readonly string[]) =>
  shortAnglesOutput.refine(({ angles }) => angles.every((angle) => blockIds.includes(angle.blockId)), {
    message: 'bloque_desconocido',
  })

export const SCRIPT_OUTPUTS = {
  escaleta: outlineOutput,
  guion: draftOutput,
  guion_short: shortDraftOutput,
  bloque_guion: blockOutput,
  investigacion: researchOutput,
  comprobar_guion: checkOutput,
  enfoques_short: shortAnglesOutput,
} as const
export type ScriptUse = keyof typeof SCRIPT_OUTPUTS
export const SCRIPT_USES = Object.keys(SCRIPT_OUTPUTS) as [ScriptUse, ...ScriptUse[]]
