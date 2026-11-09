import { z } from 'zod'
import { durationSeconds } from './duration.ts'
import { OUTLINE_BLOCK_TYPES, SCRIPT_LIMITS } from './model.ts'

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

export const SCRIPT_OUTPUTS = {
  escaleta: outlineOutput,
  guion: draftOutput,
  guion_short: shortDraftOutput,
  bloque_guion: blockOutput,
} as const
export type ScriptUse = keyof typeof SCRIPT_OUTPUTS
export const SCRIPT_USES = Object.keys(SCRIPT_OUTPUTS) as [ScriptUse, ...ScriptUse[]]
