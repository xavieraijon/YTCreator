import type { Idea, IdeaFormat, IdeaStatus, IdeaVerdict } from './model.ts'

// «Descargar como documento» and «Descargar como datos» of the idea bank (specs/004-idea-bank/data-model.md,
// «Exportación del banco»): the creator's data, theirs to take (principle VII). The archived ideas do not go.

/** What the export needs of the last measure of an idea. */
export interface ExportMeasure {
  readonly status: 'medida' | 'fallida'
  readonly verdict: IdeaVerdict | null
  readonly reason: string | null
  readonly figures: unknown
  readonly source: string
  readonly measuredAt: string
  readonly thresholdsVersion: number
  /** The idea changed after this measure: it may not say the same of it now. Only the document says it. */
  readonly olderRevision: boolean
  /** Older than `ideas.staleDays` (FR-010). Only the document says it: the data carry the date. */
  readonly stale: boolean
}

export interface BankExportInput {
  readonly exportedAt: string
  readonly channel: { readonly id: string; readonly displayName: string | null }
  /** The ideas out of the archive, in the order of the bank, each with its last measure. */
  readonly ideas: readonly { readonly idea: Idea; readonly measure: ExportMeasure | null }[]
}

export function bankJson(input: BankExportInput) {
  return {
    version: 1,
    exportedAt: input.exportedAt,
    channel: { id: input.channel.id, displayName: input.channel.displayName },
    ideas: input.ideas.map(({ idea, measure }) => ({
      title: idea.title,
      hook: idea.hook,
      pillar: idea.pillar,
      format: idea.format,
      status: idea.status,
      queuePosition: idea.queuePosition,
      origin: idea.origin,
      queries: { query: idea.query, broadQuery: idea.broadQuery, queryEn: idea.queryEn },
      notes: idea.notes,
      // A failed measure leaves the idea unmeasured: there is no verdict to carry.
      measure:
        measure?.status === 'medida'
          ? {
              verdict: measure.verdict,
              reason: measure.reason,
              figures: measure.figures,
              source: measure.source,
              measuredAt: measure.measuredAt,
              // The limits of the semaphore are an assumption of YTCreator (principle V).
              assumption: true,
              thresholdsVersion: measure.thresholdsVersion,
            }
          : null,
    })),
  }
}

const FORMAT: Record<IdeaFormat, string> = { largo: 'Vídeo largo', short: 'Short' }
const STATUS: Record<IdeaStatus, string> = {
  banco: 'En el banco',
  elegida: 'Elegida para guion',
  hecha: 'Hecha',
  archivada: 'Archivada',
}
const VERDICT: Record<IdeaVerdict, string> = {
  hueco: 'Hay hueco',
  competido: 'Competido',
  quemado: 'Quemado',
  frio: 'Frío',
}
// In the time zone of the machine that runs YTCreator, the creator's: the same day the card shows.
const day = (iso: string) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(iso))
// The notes are written in a text area: in the list they go on one line, or a «## » would start a section.
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()

function semaphore(measure: ExportMeasure | null): string {
  if (measure?.status !== 'medida' || !measure.verdict) return 'Sin medir'
  const notes = [
    ...(measure.stale ? ['es una medida antigua'] : []),
    ...(measure.olderRevision ? ['la idea cambió después de medirla'] : []),
  ].map((note) => `; ${note}`)
  return `${VERDICT[measure.verdict]} (medida en YouTube el ${day(measure.measuredAt)}${notes.join('')}; los límites del semáforo son un supuesto nuestro)`
}

// Who wrote the idea, as the card says it (principle II: what the AI proposes is told apart).
function originOf(idea: Idea, titles: ReadonlyMap<string, string>): string {
  if (idea.origin === 'ia') return 'Propuesta por la IA'
  if (idea.origin === 'creador') return 'Tuya'
  const source = idea.sourceIdeaId ? titles.get(idea.sourceIdeaId) : undefined
  return source ? `Otro enfoque de «${oneLine(source)}»` : 'Otro enfoque de otra idea'
}

function block(
  entry: BankExportInput['ideas'][number],
  place: number | null,
  titles: ReadonlyMap<string, string>,
): string[] {
  const { idea, measure } = entry
  return [
    '### ' + (place === null ? '' : String(place) + '. ') + idea.title,
    '',
    `- Formato: ${FORMAT[idea.format]}`,
    `- Estado: ${STATUS[idea.status]}`,
    `- Origen: ${originOf(idea, titles)}`,
    ...(idea.pillar ? [`- Tema del canal: ${idea.pillar}`] : []),
    ...(idea.hook ? [`- Gancho: ${oneLine(idea.hook)}`] : []),
    `- Semáforo: ${semaphore(measure)}`,
    ...(idea.notes.trim() ? [`- Notas: ${oneLine(idea.notes)}`] : []),
    '',
  ]
}

/** The same content in plain text: the queue first, then the bank and the done ones last. */
export function bankMarkdown(input: BankExportInput): string {
  const queue = input.ideas
    .filter(({ idea }) => idea.status === 'elegida')
    .sort((a, b) => (a.idea.queuePosition ?? 0) - (b.idea.queuePosition ?? 0))
  const bank = input.ideas.filter(({ idea }) => idea.status === 'banco')
  const done = input.ideas.filter(({ idea }) => idea.status === 'hecha')
  const titles = new Map(input.ideas.map(({ idea }) => [idea.id, idea.title]))
  const section = (title: string, list: typeof input.ideas, numbered: boolean) => {
    const blocks = list.flatMap((entry, i) => block(entry, numbered ? i + 1 : null, titles))
    return list.length === 0 ? [] : [`## ${title}`, '', ...blocks]
  }
  return [
    `# Banco de ideas${input.channel.displayName ? ` de ${input.channel.displayName}` : ''}`,
    '',
    `Descargado el ${day(input.exportedAt)}.`,
    '',
    ...(input.ideas.length === 0 ? ['Todavía no hay ideas en el banco.', ''] : []),
    ...section('Próximos vídeos', queue, true),
    ...section('En el banco', bank, false),
    ...section('Hechas', done, false),
  ]
    .join('\n')
    .replace(/\n+$/, '\n')
}

export function bankFileName(displayName: string | null, format: 'md' | 'json'): string {
  const base = (displayName ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `banco-de-ideas-${base || 'de-mi-canal'}.${format}`
}
