import { z } from 'zod'
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

export const SCRIPT_OUTPUTS = { escaleta: outlineOutput } as const
export type ScriptUse = keyof typeof SCRIPT_OUTPUTS
export const SCRIPT_USES = Object.keys(SCRIPT_OUTPUTS) as [ScriptUse, ...ScriptUse[]]
