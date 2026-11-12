import { z } from 'zod'
import type { IdeaFormat } from '../ideas/model.ts'

// The script of an idea: its facts, its outline and what is said (specs/005-script-and-outline/data-model.md).
export const SCRIPT_KINDS = ['hechos', 'escaleta', 'guion'] as const
export type ScriptKind = (typeof SCRIPT_KINDS)[number]

export const VERSION_ORIGINS = [
  'ia',
  'edicion',
  'bloque_ia',
  'recuperada',
  'comprobacion',
  'marcas',
  'heredada',
] as const
export type VersionOrigin = (typeof VERSION_ORIGINS)[number]

export const FACT_LABELS = ['comprobado', 'una_fuente', 'sin_confirmar', 'del_creador'] as const
export type FactLabel = (typeof FACT_LABELS)[number]
export const FACT_ORIGINS = ['ia', 'creador'] as const
export type FactOrigin = (typeof FACT_ORIGINS)[number]
export const LINK_STATES = ['abre', 'no_abre', 'sin_comprobar'] as const
export type LinkState = (typeof LINK_STATES)[number]

export const OUTLINE_BLOCK_TYPES = ['gancho', 'contexto', 'acto', 'cierre'] as const
export type OutlineBlockType = (typeof OUTLINE_BLOCK_TYPES)[number]
export const DRAFT_BLOCK_TYPES = [...OUTLINE_BLOCK_TYPES, 'desarrollo'] as const
export type DraftBlockType = (typeof DRAFT_BLOCK_TYPES)[number]

export const CLAIM_STATUSES = ['pendiente', 'confirmada', 'corregida', 'sin_marca', 'quitada'] as const
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]
export const CLAIM_REASONS = ['sin_respaldo', 'hecho_dudoso'] as const
export type ScriptClaimReason = (typeof CLAIM_REASONS)[number]
export const CLAIM_VERDICTS = ['correcto', 'matizar', 'incorrecto', 'sin_fuente'] as const
export type ClaimVerdict = (typeof CLAIM_VERDICTS)[number]

export const VOICE_ADDRESSES = ['tu', 'usted'] as const
export type VoiceAddress = (typeof VOICE_ADDRESSES)[number]
export const VOICE_REGISTERS = ['cercano', 'sobrio', 'energico'] as const
export type VoiceRegister = (typeof VOICE_REGISTERS)[number]

export const SCRIPT_LIMITS = {
  longSeconds: { min: 180, max: 1800, byDefault: 600 },
  shortSeconds: { min: 15, byDefault: 45 },
  notes: 20_000,
  sample: 4000,
  instructions: 500,
  wordsPerMinute: { min: 100, max: 220, byDefault: 150 },
  facts: 60,
  factText: 600,
  sourceTitle: 300,
  sourceUrl: 2048,
  factSources: 8,
  reference: 500,
  outlineBlocks: 30,
  blockTitle: 120,
  blockPurpose: 300,
  blockHint: 300,
  blockText: 12_000,
  visual: 500,
  claimText: 600,
} as const

const id = z.string().min(1)

// Blocks are matched by their id (R10): two with the same one could not be told apart.
const uniqueIds = (blocks: readonly { id: string }[]) => new Set(blocks.map((block) => block.id)).size === blocks.length

export const scriptSourceSchema = z
  .object({
    id,
    url: z
      .url({ protocol: /^https?$/ })
      .max(SCRIPT_LIMITS.sourceUrl)
      .nullable(),
    reference: z.string().max(SCRIPT_LIMITS.reference).nullable(),
    title: z.string().max(SCRIPT_LIMITS.sourceTitle),
    accessedAt: z.string().min(1),
    link: z.enum(LINK_STATES).nullable(),
  })
  .refine((source) => source.url !== null || (source.reference !== null && source.reference.trim() !== ''), {
    message: 'sin_fuente',
  })
export type ScriptSource = z.infer<typeof scriptSourceSchema>

export const factSchema = z
  .object({
    id,
    text: z.string().max(SCRIPT_LIMITS.factText),
    label: z.enum(FACT_LABELS),
    origin: z.enum(FACT_ORIGINS),
    sources: z.array(scriptSourceSchema).max(SCRIPT_LIMITS.factSources),
    alternatives: z.string().max(SCRIPT_LIMITS.factText).nullable(),
  })
  .refine((fact) => fact.text.trim() !== '' || (fact.origin === 'creador' && fact.sources.length > 0), {
    message: 'sin_texto',
  })
export type Fact = z.infer<typeof factSchema>

export const factsContentSchema = z.object({ facts: z.array(factSchema).max(SCRIPT_LIMITS.facts) })
export type FactsContent = z.infer<typeof factsContentSchema>

const hint = z.string().max(SCRIPT_LIMITS.blockHint).nullable()

// The title may be empty while the creator writes: approving is what asks for one (data-model.md, «Reglas»).
export const outlineBlockSchema = z.object({
  id,
  type: z.enum(OUTLINE_BLOCK_TYPES),
  title: z.string().max(SCRIPT_LIMITS.blockTitle),
  purpose: z.string().max(SCRIPT_LIMITS.blockPurpose),
  question: hint,
  reward: hint,
  bridge: hint,
  seconds: z.number().int().nonnegative(),
})
export type OutlineBlock = z.infer<typeof outlineBlockSchema>

export const outlineContentSchema = z
  .object({
    blocks: z.array(outlineBlockSchema).min(1).max(SCRIPT_LIMITS.outlineBlocks),
  })
  .refine(({ blocks }) => uniqueIds(blocks), { message: 'bloque_repetido' })
export type OutlineContent = z.infer<typeof outlineContentSchema>

export const draftBlockSchema = z.object({
  id,
  type: z.enum(DRAFT_BLOCK_TYPES),
  title: z.string().max(SCRIPT_LIMITS.blockTitle),
  text: z.string().max(SCRIPT_LIMITS.blockText),
  visual: z.string().max(SCRIPT_LIMITS.visual),
})
export type DraftBlock = z.infer<typeof draftBlockSchema>

export const claimCheckSchema = z.object({
  verdict: z.enum(CLAIM_VERDICTS),
  sources: z.array(scriptSourceSchema),
  proposal: z.string().max(SCRIPT_LIMITS.claimText).nullable(),
  checkedAt: z.string().min(1),
})
export type ClaimCheck = z.infer<typeof claimCheckSchema>

export const claimSchema = z.object({
  id,
  blockId: id,
  text: z.string().min(1).max(SCRIPT_LIMITS.claimText),
  status: z.enum(CLAIM_STATUSES),
  reason: z.enum(CLAIM_REASONS),
  factId: id.nullable(),
  check: claimCheckSchema.nullable(),
})
export type Claim = z.infer<typeof claimSchema>

export const draftContentSchema = z
  .object({
    blocks: z.array(draftBlockSchema).min(1).max(SCRIPT_LIMITS.outlineBlocks),
    claims: z.array(claimSchema),
  })
  .refine(({ blocks }) => uniqueIds(blocks), { message: 'bloque_repetido' })
  .refine(({ blocks, claims }) => claims.every((claim) => blocks.some((block) => block.id === claim.blockId)), {
    message: 'marca_sin_bloque',
  })
export type DraftContent = z.infer<typeof draftContentSchema>

export const CONTENT_SCHEMAS = {
  hechos: factsContentSchema,
  escaleta: outlineContentSchema,
  guion: draftContentSchema,
} as const

export type ContentOf<K extends ScriptKind> = z.infer<(typeof CONTENT_SCHEMAS)[K]>

// `core` does not read the knowledge package: the most a Short can last comes from whoever asks (shorts.json).
export function targetSecondsSchema(format: IdeaFormat, shortMaxSeconds: number) {
  const seconds = z.number().int()
  return format === 'largo'
    ? seconds.min(SCRIPT_LIMITS.longSeconds.min).max(SCRIPT_LIMITS.longSeconds.max)
    : seconds.min(SCRIPT_LIMITS.shortSeconds.min).max(shortMaxSeconds)
}

export const defaultTargetSeconds = (format: IdeaFormat): number =>
  format === 'largo' ? SCRIPT_LIMITS.longSeconds.byDefault : SCRIPT_LIMITS.shortSeconds.byDefault

export const scriptSettingsSchema = z.object({
  address: z.enum(VOICE_ADDRESSES),
  register: z.enum(VOICE_REGISTERS),
  sample: z.string().max(SCRIPT_LIMITS.sample),
  wordsPerMinute: z.number().int().min(SCRIPT_LIMITS.wordsPerMinute.min).max(SCRIPT_LIMITS.wordsPerMinute.max),
})
export type ScriptSettings = z.infer<typeof scriptSettingsSchema>

export const DEFAULT_SCRIPT_SETTINGS: ScriptSettings = {
  address: 'tu',
  register: 'cercano',
  sample: '',
  wordsPerMinute: SCRIPT_LIMITS.wordsPerMinute.byDefault,
}
