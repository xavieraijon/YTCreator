import type { IdeaFormat } from '../ideas/model.ts'
import {
  emptyPiece,
  formatKinds,
  type PackageContentOf,
  type PackageKind,
  tagsLength,
  type TitlesContent,
} from './model.ts'

// The review of the package, without AI and in the browser, with the figures of `publish/youtube.json` and
// `publish/craft.json` (research.md R13, FR-012). Only an empty piece stops the approval (FR-013).

export const PACKAGE_REVIEW_RULES = [
  'titulo_largo',
  'titulo_movil',
  'descripcion_larga',
  'capitulos_sin_cero',
  'capitulos_pocos',
  'capitulo_corto',
  'etiquetas_largas',
  'hashtags_muchos',
  'sin_parte_fija',
  'miniatura_repite_titulo',
  'pieza_vacia',
] as const
export type PackageReviewRule = (typeof PACKAGE_REVIEW_RULES)[number]

/** The figures the review uses, read from the knowledge packages by the server (never copied here). */
export interface PackageReviewFigures {
  readonly titleMaxChars: number
  readonly mobileTitleChars: number
  readonly descriptionMaxChars: number
  readonly tagsMaxTotalChars: number
  readonly chapterMinCount: number
  readonly chapterMinSeconds: number
  readonly hashtagsShown: number
}

export interface PackageReviewNotice {
  readonly rule: PackageReviewRule
  /** The piece the notice is about: the screen takes the creator there. */
  readonly kind: PackageKind
  /** What there is and what YouTube takes, when the rule has a figure. */
  readonly value?: number
  readonly limit?: number
  readonly titleId?: string
  readonly chapterId?: string
  readonly conceptId?: string
  /** Only an empty piece stops the approval (FR-013). */
  readonly blocking: boolean
}

export type PieceContents = { readonly [K in PackageKind]?: PackageContentOf<K> | null }

export interface PackageReviewInput {
  readonly format: IdeaFormat
  readonly pieces: PieceContents
  /** The chapters with when each one starts, as the package view gives them. */
  readonly chapters: readonly { readonly id: string; readonly startSeconds: number }[]
  /** How long the approved script lasts at the channel's pace: where the last chapter ends. */
  readonly scriptSeconds: number
  /** The description as it is copied, or `null` without one. */
  readonly assembled: string | null
}

// Words to compare a thumbnail with the title: without accents, case or punctuation.
const wordsOf = (text: string) =>
  new Set(
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word !== ''),
  )

/** Whether more than half of the words of the big text are already in the title (R8: it should add, not repeat). */
export function repeatsTitle(bigText: string, title: string): boolean {
  const big = wordsOf(bigText)
  if (big.size === 0) return false
  const inTitle = wordsOf(title)
  const shared = [...big].filter((word) => inTitle.has(word)).length
  return shared * 2 > big.size
}

const chosenTitles = (titles: TitlesContent) =>
  [...(titles.main === null ? [] : [titles.main]), ...titles.alternatives].flatMap((id) => {
    const found = titles.candidates.find((candidate) => candidate.id === id)
    return found ? [found] : []
  })

function titleNotices(titles: TitlesContent, figures: PackageReviewFigures): PackageReviewNotice[] {
  return chosenTitles(titles).flatMap((title): PackageReviewNotice[] => {
    const value = [...title.text].length
    if (value > figures.titleMaxChars)
      return [
        {
          rule: 'titulo_largo',
          kind: 'titulos',
          value,
          limit: figures.titleMaxChars,
          titleId: title.id,
          blocking: false,
        },
      ]
    if (value > figures.mobileTitleChars)
      return [
        {
          rule: 'titulo_movil',
          kind: 'titulos',
          value,
          limit: figures.mobileTitleChars,
          titleId: title.id,
          blocking: false,
        },
      ]
    return []
  })
}

function chapterNotices(input: PackageReviewInput, figures: PackageReviewFigures): PackageReviewNotice[] {
  const { chapters } = input
  if (chapters.length === 0) return []
  const notices: PackageReviewNotice[] = []
  if (chapters[0]!.startSeconds !== 0) notices.push({ rule: 'capitulos_sin_cero', kind: 'capitulos', blocking: false })
  if (chapters.length < figures.chapterMinCount)
    notices.push({
      rule: 'capitulos_pocos',
      kind: 'capitulos',
      value: chapters.length,
      limit: figures.chapterMinCount,
      blocking: false,
    })
  chapters.forEach((chapter, index) => {
    const end = chapters[index + 1]?.startSeconds ?? input.scriptSeconds
    const value = end - chapter.startSeconds
    if (value < figures.chapterMinSeconds)
      notices.push({
        rule: 'capitulo_corto',
        kind: 'capitulos',
        value: Math.max(0, value),
        limit: figures.chapterMinSeconds,
        chapterId: chapter.id,
        blocking: false,
      })
  })
  return notices
}

/** What YouTube would not take, or tends to go wrong, in the order of YouTube Studio; empty pieces first. */
export function reviewPackage(input: PackageReviewInput, figures: PackageReviewFigures): PackageReviewNotice[] {
  const { pieces, format } = input
  const notices: PackageReviewNotice[] = []

  for (const kind of formatKinds(format)) {
    const content = pieces[kind]
    if (content === undefined || content === null || emptyPiece(kind, content))
      notices.push({ rule: 'pieza_vacia', kind, blocking: true })
  }

  if (pieces.titulos) notices.push(...titleNotices(pieces.titulos, figures))

  const description = pieces.descripcion
  if (description) {
    if (input.assembled !== null) {
      const value = [...input.assembled].length
      if (value > figures.descriptionMaxChars)
        notices.push({
          rule: 'descripcion_larga',
          kind: 'descripcion',
          value,
          limit: figures.descriptionMaxChars,
          blocking: false,
        })
    }
    if (format === 'short' && description.hashtags.length > figures.hashtagsShown)
      notices.push({
        rule: 'hashtags_muchos',
        kind: 'descripcion',
        value: description.hashtags.length,
        limit: figures.hashtagsShown,
        blocking: false,
      })
    if (description.fixedText.trim() === '')
      notices.push({ rule: 'sin_parte_fija', kind: 'descripcion', blocking: false })
  }

  if (format === 'largo' && pieces.capitulos) notices.push(...chapterNotices(input, figures))

  if (pieces.etiquetas) {
    const value = tagsLength(pieces.etiquetas.tags)
    if (value > figures.tagsMaxTotalChars)
      notices.push({
        rule: 'etiquetas_largas',
        kind: 'etiquetas',
        value,
        limit: figures.tagsMaxTotalChars,
        blocking: false,
      })
  }

  const mainTitle = pieces.titulos ? chosenTitles(pieces.titulos)[0] : undefined
  const thumbnails = pieces.miniaturas
  if (format === 'largo' && thumbnails && mainTitle && pieces.titulos?.main === mainTitle.id) {
    for (const id of thumbnails.chosen) {
      const concept = thumbnails.concepts.find((one) => one.id === id)
      if (concept && repeatsTitle(concept.bigText, mainTitle.text))
        notices.push({ rule: 'miniatura_repite_titulo', kind: 'miniaturas', conceptId: concept.id, blocking: false })
    }
  }

  return notices
}

/** The notices that do not stop the approval: how many the creator is told about before approving (FR-013). */
export const warningNotices = (notices: readonly PackageReviewNotice[]) => notices.filter((notice) => !notice.blocking)
