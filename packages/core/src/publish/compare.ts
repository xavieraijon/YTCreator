import { z } from 'zod'
import { fixedMinute } from './chapters.ts'
import type {
  ChaptersContent,
  CommentContent,
  DescriptionContent,
  PackageContentOf,
  PackageKind,
  ShortCoverContent,
  TagsContent,
  ThumbnailsContent,
  TitlesContent,
} from './model.ts'

// Two versions of one piece of the package, item by item and matched by `id`, as the history of 005 does (US5).
export const PIECE_CHANGES = ['igual', 'cambiado', 'nuevo', 'quitado'] as const
export type PieceChange = (typeof PIECE_CHANGES)[number]

export const PIECE_FIELDS = [
  'title',
  'why',
  'block',
  'role',
  'scene',
  'bigText',
  'emotion',
  'composition',
  'colors',
  'forTitle',
  'chosen',
  'moment',
  'screenText',
  'text',
  'start',
  'blocks',
] as const
export type PieceField = (typeof PIECE_FIELDS)[number]

/** The parts of the description, each compared on its own. */
export const DESCRIPTION_PARTS = ['firstLines', 'body', 'hashtags', 'fixedText'] as const
export type DescriptionPart = (typeof DESCRIPTION_PARTS)[number]

const fieldSchema = z.object({ field: z.enum(PIECE_FIELDS), value: z.string() })
export type PieceFieldValue = z.infer<typeof fieldSchema>

export const pieceItemChangeSchema = z.object({
  id: z.string(),
  change: z.enum(PIECE_CHANGES),
  /** What names it: a title, a chapter, a tag; empty when the screen names it by its kind or its part. */
  title: z.string(),
  /** What the older version says, or null if it was not there. If it changed, only what changed. */
  before: z.array(fieldSchema).nullable(),
  /** What the current version says, or null if it is gone. If it changed, only what changed. */
  after: z.array(fieldSchema).nullable(),
  /** Whether what is shown was proposed by the AI, so it is marked as its opinion (principle II). */
  fromAi: z.boolean(),
})
export type PieceItemChange = z.infer<typeof pieceItemChangeSchema>

export const pieceComparisonSchema = z.object({
  changes: z.array(pieceItemChangeSchema),
  /** What both versions share goes in another order: going back would move it. */
  orderChanged: z.boolean(),
})
export type PieceComparison = z.infer<typeof pieceComparisonSchema>

interface Item {
  readonly id: string
  readonly title: string
  readonly fields: readonly PieceFieldValue[]
  readonly fromAi: boolean
}

const field = (name: PieceField, value: string): PieceFieldValue => ({ field: name, value })

function roleOf(content: TitlesContent, id: string): string {
  if (content.main === id) return 'principal'
  return content.alternatives.includes(id) ? 'alternativa' : ''
}

// Titles and thumbnail ideas say each who wrote it; the rest is the AI's while its version is (as the steps say it).
function itemsOf<K extends PackageKind>(kind: K, content: PackageContentOf<K>, versionFromAi: boolean): Item[] {
  return itemsWithoutOrigin(kind, content).map((item) => ({ ...item, fromAi: item.fromAi ?? versionFromAi }))
}

type Draft = Omit<Item, 'fromAi'> & { readonly fromAi?: boolean }

function itemsWithoutOrigin<K extends PackageKind>(kind: K, content: PackageContentOf<K>): Draft[] {
  switch (kind) {
    case 'titulos': {
      const titles = content as TitlesContent
      return titles.candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.text,
        fromAi: candidate.origin === 'ia',
        fields: [
          field('title', candidate.text),
          field('why', candidate.why),
          field('block', candidate.blockId ?? ''),
          field('role', roleOf(titles, candidate.id)),
        ],
      }))
    }
    case 'miniaturas': {
      const { concepts, chosen } = content as ThumbnailsContent
      return concepts.map((concept) => ({
        id: concept.id,
        title: '',
        fromAi: concept.origin === 'ia',
        fields: [
          field('scene', concept.scene),
          field('bigText', concept.bigText),
          field('emotion', concept.emotion),
          field('composition', concept.composition),
          field('colors', concept.colors),
          field('forTitle', concept.titleId ?? ''),
          field('chosen', chosen.includes(concept.id) ? 'si' : ''),
        ],
      }))
    }
    case 'portada_short': {
      const cover = content as ShortCoverContent
      return [
        {
          id: 'portada_short',
          title: '',
          fields: [
            field('block', cover.blockId ?? ''),
            field('moment', cover.moment),
            field('screenText', cover.screenText),
          ],
        },
      ]
    }
    case 'descripcion': {
      const description = content as DescriptionContent
      const parts: Record<DescriptionPart, string> = {
        firstLines: description.firstLines,
        body: description.body,
        hashtags: description.hashtags.map((tag) => `#${tag}`).join(' '),
        fixedText: description.fixedText,
      }
      // An empty part is not there: writing it is new, emptying it takes it away.
      return DESCRIPTION_PARTS.filter((part) => parts[part].trim() !== '').map((part) => ({
        id: part,
        title: '',
        fields: [field('text', parts[part])],
      }))
    }
    case 'capitulos':
      return (content as ChaptersContent).chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        fields: [
          field('title', chapter.title),
          // Only a fixed minute (written, or the real one): the others are worked out from the script each time.
          field('start', fixedMinute(chapter) ? String(chapter.startSeconds) : ''),
          field('blocks', chapter.blockIds.join(',')),
        ],
      }))
    case 'etiquetas': {
      // YouTube does not tell «Pan» from «pan»: a tag is added or removed, never changed.
      const seen = new Set<string>()
      return (content as TagsContent).tags.flatMap((tag) => {
        const id = tag.toLocaleLowerCase('es')
        if (seen.has(id)) return []
        seen.add(id)
        return [{ id, title: tag, fields: [] as PieceFieldValue[] }]
      })
    }
    default: {
      const { text } = content as CommentContent
      return text.trim() === '' ? [] : [{ id: 'comentario', title: '', fields: [field('text', text)] }]
    }
  }
}

// The title is the heading, and what is empty says nothing.
const shown = (fields: readonly PieceFieldValue[]) =>
  fields.filter(({ field: name, value }) => name !== 'title' && value !== '')

function compareItems(older: readonly Item[], current: readonly Item[]): PieceItemChange[] {
  const olderById = new Map(older.map((item) => [item.id, item]))
  const currentIds = new Set(current.map((item) => item.id))
  const result: PieceItemChange[] = current.map((item) => {
    const previous = olderById.get(item.id)
    const heading = { id: item.id, title: item.title, fromAi: item.fromAi || (previous?.fromAi ?? false) }
    if (!previous) return { ...heading, change: 'nuevo', before: null, after: shown(item.fields) }
    const differs = (one: PieceFieldValue) =>
      previous.fields.find((other) => other.field === one.field)?.value !== one.value
    if (!item.fields.some(differs)) {
      return { ...heading, change: 'igual', before: shown(previous.fields), after: shown(item.fields) }
    }
    const changed = new Set(item.fields.filter(differs).map((one) => one.field))
    const only = (fields: readonly PieceFieldValue[]) => fields.filter((one) => changed.has(one.field))
    return { ...heading, change: 'cambiado', before: only(previous.fields), after: only(item.fields) }
  })
  // What is gone stays near where it was.
  older.forEach((item, index) => {
    if (!currentIds.has(item.id)) {
      result.splice(Math.min(index, result.length), 0, {
        id: item.id,
        title: item.title,
        fromAi: item.fromAi,
        change: 'quitado',
        before: shown(item.fields),
        after: null,
      })
    }
  })
  return result
}

function orderChanged(older: readonly Item[], current: readonly Item[]): boolean {
  const inCurrent = new Set(current.map((item) => item.id))
  const inOlder = new Set(older.map((item) => item.id))
  const shared = older.filter((item) => inCurrent.has(item.id))
  const sharedNow = current.filter((item) => inOlder.has(item.id))
  return shared.some((item, index) => item.id !== sharedNow[index]!.id)
}

/** What an older version of a piece has that the current one does not, and the other way round. */
export function comparePieces<K extends PackageKind>(
  kind: K,
  older: PackageContentOf<K>,
  current: PackageContentOf<K>,
  fromAi: { readonly older: boolean; readonly current: boolean } = { older: false, current: false },
): PieceComparison {
  const before = itemsOf(kind, older, fromAi.older)
  const after = itemsOf(kind, current, fromAi.current)
  return { changes: compareItems(before, after), orderChanged: orderChanged(before, after) }
}
