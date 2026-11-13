import type { IdeaFormat } from '../ideas/model.ts'
import type { ShortCoverContent, ThumbnailConcept } from './model.ts'
import type { PackageStatus } from './status.ts'
import type { StudioItem } from './studio.ts'

// The publishing packages, theirs to take: a document to read, a file of data and, apart, what a designer needs for
// the thumbnail (principle VII, research.md R15, FR-023). Nothing here goes to YouTube (FR-016).

export type ExportConcept = Pick<ThumbnailConcept, 'scene' | 'bigText' | 'emotion' | 'composition' | 'colors'> & {
  /** The title it goes with, if it is still there. */
  readonly title: string | null
}

export interface PackageExportItem {
  /** The main title, or the working title of the idea before there is one. */
  readonly title: string
  readonly format: IdeaFormat
  readonly status: PackageStatus
  readonly approvedAt: string | null
  /** How many notices were left when it was approved. */
  readonly approvedWarnings: number | null
  readonly mainTitle: string | null
  readonly alternatives: readonly string[]
  /** The description as it is copied. */
  readonly description: string | null
  /** The thumbnails chosen, in a long video. */
  readonly thumbnails: readonly ExportConcept[]
  /** The cover suggested, in a Short. */
  readonly cover: ShortCoverContent | null
  readonly tags: readonly string[]
  readonly comment: string
  readonly studio: readonly StudioItem[]
  readonly studioDone: readonly string[]
  /** In a Short drawn from a long video, the title of that video. */
  readonly parentTitle: string | null
}

export interface PackageExportInput {
  readonly exportedAt: string
  readonly channel: { readonly id: string; readonly displayName: string | null }
  readonly packages: readonly PackageExportItem[]
  /** Packages of the channel left out because a version no longer reads: the document says how many (principle VII). */
  readonly skipped?: number
}

export function packageJson(input: PackageExportInput) {
  return {
    version: 1,
    exportedAt: input.exportedAt,
    channel: { id: input.channel.id, displayName: input.channel.displayName },
    skipped: input.skipped ?? 0,
    packages: input.packages.map((item) => ({
      title: item.title,
      format: item.format,
      status: item.status,
      approvedAt: item.approvedAt,
      approvedWarnings: item.approvedWarnings,
      titles: { main: item.mainTitle, alternatives: [...item.alternatives] },
      description: item.description,
      thumbnails: item.thumbnails.map((concept) => ({ ...concept })),
      cover: item.cover,
      tags: [...item.tags],
      comment: item.comment,
      studio: item.studio.map((setting) => ({ ...setting, done: item.studioDone.includes(setting.key) })),
      parentTitle: item.parentTitle,
    })),
  }
}

// As the screens say them (publish.es.ts): a Short has a cover, not a thumbnail.
const STATUS: Record<PackageStatus, string> = {
  sin_empezar: 'por empezar',
  portada_borrador: 'título y miniatura en borrador',
  portada_aprobada: 'título y miniatura aprobados',
  textos_borrador: 'descripción en borrador',
  textos_aprobados: 'descripción aprobada',
  aprobado: 'publicación aprobada, lista para publicar',
}
const STATUS_SHORT: Partial<Record<PackageStatus, string>> = {
  portada_borrador: 'título y portada en borrador',
  portada_aprobada: 'título y portada aprobados',
}

// In the time zone of the machine that runs YTCreator, the same day the screen shows.
const day = (iso: string) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(iso))
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()

// A text copied as it is, line by line: inside a fence longer than any run of backticks it has.
function verbatim(text: string): string[] {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return [`${fence}text`, text, fence]
}

const ONE_COVER =
  'En un Short no hay miniatura: la portada se elige en la app de YouTube del móvil, entre sus fotogramas.'

function conceptLines(concept: ExportConcept, index: number): string[] {
  return [
    `${index + 1}. ${oneLine(concept.scene)}`,
    ...[
      concept.bigText && `Texto grande: «${oneLine(concept.bigText)}»`,
      concept.emotion && `Emoción: ${oneLine(concept.emotion)}`,
      concept.composition && `Dónde va cada cosa: ${oneLine(concept.composition)}`,
      concept.colors && `Colores: ${oneLine(concept.colors)}`,
      concept.title && `Va con el título: «${oneLine(concept.title)}»`,
    ]
      .filter((line) => Boolean(line))
      .map((line) => `   - ${String(line)}`),
  ]
}

function coverLines(item: PackageExportItem): string[] {
  if (item.format === 'short') {
    if (!item.cover || item.cover.moment.trim() === '') return []
    return [
      '## Portada del Short',
      '',
      ONE_COVER,
      '',
      `- Momento: ${oneLine(item.cover.moment)}`,
      ...(item.cover.screenText ? [`- Texto que se ve: «${oneLine(item.cover.screenText)}»`] : []),
      '',
    ]
  }
  if (item.thumbnails.length === 0) return []
  return ['## Miniatura', '', ...item.thumbnails.flatMap(conceptLines), '']
}

function studioLines(item: PackageExportItem): string[] {
  const mark = (key: string) => (item.studioDone.includes(key) ? '[x]' : '[ ]')
  return [
    '## Ajustes de YouTube Studio',
    '',
    ...item.studio.flatMap((setting) => {
      switch (setting.key) {
        case 'publico_infantil':
          return [
            `- ${mark(setting.key)} Público: ${setting.answer === null ? 'no se ha podido leer el perfil del canal; revísalo y elige tú en YouTube Studio' : setting.answer ? 'sí, está hecho para niños' : 'no, no está hecho para niños'}. ${setting.why}`,
            ...(setting.answer ? setting.implications.map((line) => `  - ${line}`) : []),
          ]
        case 'contenido_sintetico':
          return [
            `- ${mark(setting.key)} Contenido alterado o sintético: ${setting.question} ${setting.why}`,
            ...setting.mustDisclose.map((line) => `  - Hay que avisar: ${line}`),
            ...setting.noNeed.map((line) => `  - No hace falta: ${line}`),
          ]
        case 'idioma':
          return [`- ${mark(setting.key)} Idioma: ${setting.answer} (supuesto). ${setting.why}`]
        case 'categoria':
          return [
            `- ${mark(setting.key)} Categoría: ${setting.answer}${setting.assumption ? ' (sugerida, sin elegir)' : ''}. ${setting.why}`,
          ]
        default:
          return []
      }
    }),
    '',
  ]
}

const leftNotices = (count: number) =>
  count === 0 ? ', sin avisos' : count === 1 ? ', con 1 aviso sin resolver' : `, con ${count} avisos sin resolver`

function packageSection(item: PackageExportItem): string[] {
  return [
    `# ${oneLine(item.title)}`,
    '',
    `- Formato: ${item.format === 'largo' ? 'vídeo largo' : 'Short'}`,
    `- Estado: ${(item.format === 'short' ? STATUS_SHORT[item.status] : undefined) ?? STATUS[item.status]}`,
    ...(item.approvedAt ? [`- Aprobada el ${day(item.approvedAt)}${leftNotices(item.approvedWarnings ?? 0)}`] : []),
    ...(item.parentTitle ? [`- Sale del vídeo largo «${oneLine(item.parentTitle)}»`] : []),
    '',
    // In the order YouTube Studio asks for them (R14).
    ...(item.mainTitle
      ? [
          '## Título',
          '',
          ...verbatim(item.mainTitle),
          '',
          ...(item.alternatives.length > 0
            ? ['Otros títulos para probar:', '', ...item.alternatives.map((title) => `- ${oneLine(title)}`), '']
            : []),
        ]
      : []),
    ...(item.description ? ['## Descripción', '', ...verbatim(item.description), ''] : []),
    ...coverLines(item),
    ...(item.tags.length > 0 ? ['## Etiquetas', '', ...verbatim(item.tags.join(', ')), ''] : []),
    ...(item.comment.trim() ? ['## Comentario fijado', '', ...verbatim(item.comment.trim()), ''] : []),
    ...(item.studio.length > 0 ? studioLines(item) : []),
  ]
}

export function packageMarkdown(input: PackageExportInput): string {
  const skipped =
    input.skipped && input.skipped > 0
      ? [
          `Faltan ${input.skipped === 1 ? '1 publicación' : `${input.skipped} publicaciones`} que no se han podido leer: ábrelas en YTCreator para ver qué les pasa.`,
          '',
        ]
      : []
  if (input.packages.length === 0) return `${[...skipped, 'Todavía no hay ninguna publicación.'].join('\n')}\n`
  const body = input.packages.map((item) => packageSection(item).join('\n').trimEnd()).join('\n\n---\n\n')
  return `${[...skipped, body].join('\n')}\n`
}

/**
 * What a designer needs for the thumbnail, and nothing of the channel: the title it goes with and the ideas chosen
 * (R15). In a Short, the moment to pick as its cover.
 */
export function thumbnailBrief(item: PackageExportItem): string {
  const lines = [
    `# Indicaciones para ${item.format === 'short' ? 'la portada' : 'la miniatura'}: ${oneLine(item.mainTitle ?? item.title)}`,
    '',
    ...(item.format === 'short'
      ? item.cover && item.cover.moment.trim() !== ''
        ? [
            ONE_COVER,
            '',
            `- Momento: ${oneLine(item.cover.moment)}`,
            ...(item.cover.screenText ? [`- Texto que se ve: «${oneLine(item.cover.screenText)}»`] : []),
          ]
        : ['Todavía no hay portada sugerida.']
      : item.thumbnails.length > 0
        ? item.thumbnails.flatMap(conceptLines)
        : ['Todavía no hay ninguna idea de miniatura elegida.']),
  ]
  return `${lines.join('\n').trimEnd()}\n`
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export type PackageExportFormat = 'md' | 'json' | 'brief'

export const packageFileName = (title: string, format: PackageExportFormat) => {
  const name = slug(title) || 'sin-titulo'
  return format === 'brief' ? `miniatura-${name}.md` : `publicacion-${name}.${format}`
}

/** The brief of a Short is the one of its cover, and is named so. */
export const briefFileName = (title: string, videoFormat: IdeaFormat) =>
  videoFormat === 'short' ? `portada-${slug(title) || 'sin-titulo'}.md` : packageFileName(title, 'brief')

export const packagesFileName = (displayName: string | null, format: 'md' | 'json') =>
  `publicaciones-${slug(displayName ?? '') || 'de-mi-canal'}.${format}`
