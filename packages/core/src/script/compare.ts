import { z } from 'zod'
import { claimSchema, type ContentOf, DRAFT_BLOCK_TYPES, type ScriptKind, type ScriptSource } from './model.ts'

// Two versions, block by block and matched by `id` (research.md R15).
export const BLOCK_CHANGES = ['igual', 'cambiado', 'nuevo', 'quitado'] as const
export type BlockChange = (typeof BLOCK_CHANGES)[number]

export const COMPARED_FIELDS = [
  'title',
  'text',
  'visual',
  'pending',
  'purpose',
  'question',
  'reward',
  'bridge',
  'seconds',
  'fact',
  'label',
  'sources',
  'alternatives',
] as const
export type ComparedField = (typeof COMPARED_FIELDS)[number]

const fieldSchema = z.object({
  field: z.enum(COMPARED_FIELDS),
  value: z.string(),
  /** What is still to be checked in this text, so it is shown marked here too (principle II). */
  claims: z.array(claimSchema).optional(),
})
export type ComparableField = z.infer<typeof fieldSchema>

export const itemComparisonSchema = z.object({
  id: z.string(),
  change: z.enum(BLOCK_CHANGES),
  type: z.enum(DRAFT_BLOCK_TYPES).nullable(),
  title: z.string(),
  /** What the older version says, or null if it was not there. If it changed, only what changed. */
  before: z.array(fieldSchema).nullable(),
  /** What the current version says, or null if it is gone. If it changed, only what changed. */
  after: z.array(fieldSchema).nullable(),
})
export type ItemComparison = z.infer<typeof itemComparisonSchema>

export interface ComparableItem {
  readonly id: string
  /** The kind of block, whose name stands in for a title it does not have. Facts have none. */
  readonly type: ItemComparison['type']
  readonly title: string
  readonly fields: readonly ComparableField[]
}

const nameOfSource = (source: ScriptSource) => source.title || source.reference || source.url || ''

export function comparableItems<K extends ScriptKind>(kind: K, content: ContentOf<K>): ComparableItem[] {
  const plain = (field: ComparedField, value: string): ComparableField => ({ field, value })
  switch (kind) {
    case 'hechos':
      return (content as ContentOf<'hechos'>).facts.map((fact) => ({
        id: fact.id,
        type: null,
        title: '',
        fields: [
          plain('fact', fact.text),
          plain('label', fact.label),
          plain('sources', fact.sources.map(nameOfSource).join(', ')),
          plain('alternatives', fact.alternatives ?? ''),
        ],
      }))
    case 'escaleta':
      return (content as ContentOf<'escaleta'>).blocks.map((block) => ({
        id: block.id,
        type: block.type,
        title: block.title,
        fields: [
          plain('title', block.title),
          plain('purpose', block.purpose),
          plain('question', block.question ?? ''),
          plain('reward', block.reward ?? ''),
          plain('bridge', block.bridge ?? ''),
          plain('seconds', String(block.seconds)),
        ],
      }))
    default: {
      const { blocks, claims } = content as ContentOf<'guion'>
      return blocks.map((block) => {
        const own = claims.filter((claim) => claim.blockId === block.id && claim.status === 'pendiente')
        return {
          id: block.id,
          type: block.type,
          title: block.title,
          fields: [
            plain('title', block.title),
            { field: 'text' as const, value: block.text, claims: own },
            plain('visual', block.visual),
            plain('pending', String(own.length)),
          ],
        }
      })
    }
  }
}

// The title is the heading, and what is empty or zero says nothing.
const shown = (fields: readonly ComparableField[]) =>
  fields.filter(({ field, value }) => field !== 'title' && value !== '' && !(field === 'pending' && value === '0'))

export function compareItems(older: readonly ComparableItem[], current: readonly ComparableItem[]): ItemComparison[] {
  const olderById = new Map(older.map((item) => [item.id, item]))
  const currentIds = new Set(current.map((item) => item.id))
  const heading = ({ id, type, title }: ComparableItem) => ({ id, type, title })
  const result: ItemComparison[] = current.map((item) => {
    const previous = olderById.get(item.id)
    if (!previous) return { ...heading(item), change: 'nuevo', before: null, after: shown(item.fields) }
    const differs = (one: ComparableField) =>
      previous.fields.find((other) => other.field === one.field)?.value !== one.value
    if (!item.fields.some(differs)) {
      return { ...heading(item), change: 'igual', before: shown(previous.fields), after: shown(item.fields) }
    }
    const changedFields = new Set(item.fields.filter(differs).map((one) => one.field))
    const only = (fields: readonly ComparableField[]) => fields.filter((one) => changedFields.has(one.field))
    return { ...heading(item), change: 'cambiado', before: only(previous.fields), after: only(item.fields) }
  })
  // What is gone stays near where it was.
  older.forEach((item, index) => {
    if (!currentIds.has(item.id)) {
      result.splice(Math.min(index, result.length), 0, {
        ...heading(item),
        change: 'quitado',
        before: shown(item.fields),
        after: null,
      })
    }
  })
  return result
}

/** Whether what both versions share goes in a different order: going back would move it. */
export function orderChanged(older: readonly ComparableItem[], current: readonly ComparableItem[]): boolean {
  const inCurrent = new Set(current.map((item) => item.id))
  const inOlder = new Set(older.map((item) => item.id))
  const shared = older.filter((item) => inCurrent.has(item.id))
  const sharedNow = current.filter((item) => inOlder.has(item.id))
  return shared.some((item, index) => item.id !== sharedNow[index]!.id)
}
