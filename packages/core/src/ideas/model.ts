import { z } from 'zod'

// The idea bank of a channel (specs/004-idea-bank/data-model.md).
export const IDEA_STATUSES = ['banco', 'elegida', 'hecha', 'archivada'] as const
export type IdeaStatus = (typeof IDEA_STATUSES)[number]

export const IDEA_FORMATS = ['largo', 'short'] as const
export type IdeaFormat = (typeof IDEA_FORMATS)[number]

export const IDEA_ORIGINS = ['ia', 'creador', 'otro_enfoque'] as const
export type IdeaOrigin = (typeof IDEA_ORIGINS)[number]

export const IDEA_VERDICTS = ['hueco', 'competido', 'quemado', 'frio'] as const
export type IdeaVerdict = (typeof IDEA_VERDICTS)[number]

// Why the semaphore says what it says (research R3, contracts/idea-measure.md, «Textos del semáforo»).
export const IDEA_REASONS = [
  'racha_reciente',
  'agotado',
  'muchos_con_visitas',
  'llenandose',
  'pocos_con_publico',
  'pocos_sin_publico',
  'sin_racha_con_publico',
  'sin_racha_sin_publico',
] as const
export type IdeaReason = (typeof IDEA_REASONS)[number]

export const IDEA_MEASURE_STATUSES = ['medida', 'fallida'] as const
export type IdeaMeasureStatus = (typeof IDEA_MEASURE_STATUSES)[number]

export const CANDIDATE_DECISIONS = ['quedada', 'descartada'] as const
export type CandidateDecision = (typeof CANDIDATE_DECISIONS)[number]

// The ways an idea moves (data-model.md, «Estados»): out of the archive it only goes back to the bank.
const MOVES: Record<IdeaStatus, readonly IdeaStatus[]> = {
  banco: ['elegida', 'hecha', 'archivada'],
  elegida: ['banco', 'hecha', 'archivada'],
  hecha: ['archivada'],
  archivada: ['banco'],
}
export const canMoveIdea = (from: IdeaStatus, to: IdeaStatus) => from === to || MOVES[from].includes(to)

export const IDEA_BATCH_KINDS = ['ideas', 'otro_enfoque'] as const
export type IdeaBatchKind = (typeof IDEA_BATCH_KINDS)[number]

export const IDEA_LIMITS = { title: 120, hook: 300, notes: 2000, query: 120, instructions: 500 } as const

const bounded = (max: number) => z.string().trim().min(1).max(max)
// A search text, not a sentence: no quotes nor operators (contracts/ai-uses.md).
const QUOTES = /["“”«»]/
// YouTube reads these as operators: excluding a word, OR, «|», «+word» and «field:value».
const OPERATORS = /(^|\s)[-+]\S|\|| OR |\b[a-z]+:\S/i
export const searchTextSchema = bounded(IDEA_LIMITS.query)
  .refine((text) => !QUOTES.test(text), 'sin_comillas')
  .refine((text) => !OPERATORS.test(` ${text} `), 'sin_operadores')

export const ideaDraftSchema = z.object({
  title: bounded(IDEA_LIMITS.title),
  hook: bounded(IDEA_LIMITS.hook),
  pillar: bounded(IDEA_LIMITS.title),
  format: z.enum(IDEA_FORMATS),
  query: searchTextSchema,
  broadQuery: searchTextSchema,
  queryEn: searchTextSchema,
})
export type IdeaDraft = z.infer<typeof ideaDraftSchema>

export interface IdeaQueries {
  query: string | null
  broadQuery: string | null
  queryEn: string | null
}

export interface Idea extends IdeaQueries {
  id: string
  channelId: string
  origin: IdeaOrigin
  batchId: string | null
  sourceIdeaId: string | null
  title: string
  hook: string
  pillar: string | null
  format: IdeaFormat
  notes: string
  status: IdeaStatus
  position: number
  queuePosition: number | null
  original: Record<string, unknown>
  revision: number
  profileVersion: number
  createdAt: string
  updatedAt: string
}

// What measuring an idea spends with the Data API (FR-007c): each search is one page of results (up to 50) and one
// read of its videos, at the prices of thresholds.json `dataApi`. Two searches, three with the English one.
export function ideaMeasureUnits(units: { searchUnits: number; otherUnits: number }, withEnglish: boolean): number {
  const searches = withEnglish ? 3 : 2
  return searches * (units.searchUnits + units.otherUnits)
}
