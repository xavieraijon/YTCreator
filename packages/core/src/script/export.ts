import { splitMarks } from './claims.ts'
import { durationSeconds } from './duration.ts'
import type { DraftContent, FactsContent, OutlineContent, ScriptSource } from './model.ts'
import type { IdeaFormat } from '../ideas/model.ts'
import type { ScriptStatus } from './status.ts'

// The scripts of a channel, theirs to take: a document to read and a file of data (principle VII, research.md R17).
export interface ScriptExportItem {
  readonly title: string
  readonly hook: string
  readonly format: IdeaFormat
  readonly status: ScriptStatus
  readonly targetSeconds: number
  readonly wordsPerMinute: number
  readonly notes: string
  readonly facts: FactsContent | null
  readonly outline: OutlineContent | null
  readonly draft: DraftContent | null
  readonly approvedAt: string | null
  /** How many marks were left to check when it was approved. */
  readonly approvedPending: number | null
}

export interface ScriptExportInput {
  readonly exportedAt: string
  readonly channel: { readonly id: string; readonly displayName: string | null }
  readonly scripts: readonly ScriptExportItem[]
}

export function scriptJson(input: ScriptExportInput) {
  return {
    version: 1,
    exportedAt: input.exportedAt,
    channel: { id: input.channel.id, displayName: input.channel.displayName },
    scripts: input.scripts.map((script) => ({
      title: script.title,
      hook: script.hook,
      format: script.format,
      status: script.status,
      targetSeconds: script.targetSeconds,
      wordsPerMinute: script.wordsPerMinute,
      notes: script.notes,
      facts: script.facts?.facts ?? [],
      outline: script.outline?.blocks ?? [],
      draft: script.draft?.blocks ?? [],
      claims: script.draft?.claims ?? [],
      approvedAt: script.approvedAt,
      approvedPending: script.approvedPending,
    })),
  }
}

const STATUS: Record<ScriptStatus, string> = {
  sin_empezar: 'sin empezar',
  escaleta_borrador: 'escaleta en borrador',
  escaleta_aprobada: 'escaleta aprobada',
  guion_borrador: 'guion en borrador',
  guion_aprobado: 'guion aprobado',
}
const FACT_LABEL = {
  comprobado: 'comprobado',
  una_fuente: 'una sola fuente',
  sin_confirmar: 'leyenda o sin confirmar',
  del_creador: 'lo aporta el creador',
} as const
const BLOCK_TYPE = {
  gancho: 'Gancho',
  contexto: 'Contexto',
  acto: 'Acto',
  cierre: 'Cierre',
  desarrollo: 'Desarrollo',
} as const

// In the time zone of the machine that runs YTCreator, the same day the screen shows.
const day = (iso: string) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(iso))
const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()
// What the creator wrote cannot open a heading or a rule of the document.
const safe = (text: string) => text.replace(/^(\s*)(#{1,6}\s|-{3,}\s*$)/gm, '$1\\$2')

const LINK_NOTE: Partial<Record<NonNullable<ScriptSource['link']>, string>> = {
  no_abre: ', el enlace no abre',
  sin_comprobar: ', enlace sin comprobar',
}
const VERDICT = {
  correcto: 'correcto',
  matizar: 'hay que matizarlo',
  incorrecto: 'incorrecto',
  sin_fuente: 'sin fuente',
} as const

const minutes = (seconds: number) => {
  const whole = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (whole === 0) return `${rest} s`
  return rest === 0 ? `${whole} min` : `${whole} min ${rest} s`
}

function factsSection(facts: FactsContent): string[] {
  return [
    '## Hechos',
    '',
    ...facts.facts.flatMap((fact) => [
      `- ${oneLine(fact.text) || '(sin texto)'} (${FACT_LABEL[fact.label]})`,
      ...(fact.alternatives ? [`  - Otra versión: ${oneLine(fact.alternatives)}`] : []),
      ...fact.sources.map((source) => {
        const name = source.title || source.reference || source.url
        const opens = source.link ? (LINK_NOTE[source.link] ?? '') : ''
        return `  - Fuente: ${source.url ? `[${name}](${source.url})` : name} (consultada el ${day(source.accessedAt)}${opens})`
      }),
    ]),
    '',
  ]
}

function outlineSection(outline: OutlineContent): string[] {
  return [
    '## Escaleta',
    '',
    ...outline.blocks.flatMap((block, index) => [
      `${index + 1}. **${BLOCK_TYPE[block.type]}: ${block.title || 'Sin título'}** (unos ${minutes(block.seconds)})`,
      ...[
        block.purpose && `Para qué está: ${block.purpose}`,
        block.question && `Pregunta que abre: ${block.question}`,
        block.reward && `Qué da a cambio: ${block.reward}`,
        block.bridge && `Cómo engancha: ${block.bridge}`,
      ]
        .filter((line) => Boolean(line))
        .map((line) => `   - ${String(line)}`),
    ]),
    '',
  ]
}

function checksSection(draft: DraftContent): string[] {
  const checked = draft.claims.filter((claim) => claim.check !== null)
  if (checked.length === 0) return []
  return [
    '## Comprobaciones',
    '',
    ...checked.flatMap((claim) => [
      `- «${oneLine(claim.text)}»: ${VERDICT[claim.check!.verdict]} (el ${day(claim.check!.checkedAt)})`,
      ...(claim.check!.proposal ? [`  - Propuesta: ${oneLine(claim.check!.proposal)}`] : []),
      ...claim.check!.sources.map((source) => {
        const name = source.title || source.reference || source.url
        return `  - Fuente: ${source.url ? `[${name}](${source.url})` : name}${source.link ? (LINK_NOTE[source.link] ?? '') : ''}`
      }),
    ]),
    '',
  ]
}

function draftSection(draft: DraftContent, wordsPerMinute: number): string[] {
  const pending = draft.claims.filter((claim) => claim.status === 'pendiente').length
  return [
    '## Guion',
    '',
    ...(pending > 0
      ? [
          `${pending === 1 ? 'Queda 1' : `Quedan ${pending}`} por comprobar: van en negrita, con la nota «por comprobar».`,
          '',
        ]
      : []),
    ...draft.blocks.flatMap((block) => [
      `### ${oneLine(block.title) || BLOCK_TYPE[block.type]}`,
      '',
      safe(
        splitMarks(
          block.text,
          draft.claims.filter((claim) => claim.blockId === block.id),
        )
          .map((part) => (part.claimId ? `**${part.text}** *(por comprobar)*` : part.text))
          .join(''),
      ),
      '',
      ...(block.visual ? [`*Qué se ve: ${oneLine(block.visual)}*`, ''] : []),
      `*Dura unos ${minutes(durationSeconds(block.text, wordsPerMinute))}, estimado.*`,
      '',
    ]),
    ...checksSection(draft),
  ]
}

function scriptSection(script: ScriptExportItem): string[] {
  return [
    `# ${oneLine(script.title)}`,
    '',
    `- Formato: ${script.format === 'largo' ? 'vídeo largo' : 'Short'}`,
    `- Estado: ${STATUS[script.status]}`,
    `- Duración que se busca: ${minutes(script.targetSeconds)}`,
    ...(script.approvedAt
      ? [`- Aprobado el ${day(script.approvedAt)}, con ${script.approvedPending ?? 0} por comprobar`]
      : []),
    '',
    ...(script.hook ? [`Gancho de la idea: ${oneLine(script.hook)}`, ''] : []),
    ...(script.notes.trim() ? ['## Apuntes', '', safe(script.notes.trim()), ''] : []),
    ...(script.facts && script.facts.facts.length > 0 ? factsSection(script.facts) : []),
    ...(script.outline ? outlineSection(script.outline) : []),
    ...(script.draft ? draftSection(script.draft, script.wordsPerMinute) : []),
  ]
}

export function scriptMarkdown(input: ScriptExportInput): string {
  if (input.scripts.length === 0) return 'Todavía no hay ningún guion con contenido.\n'
  const body = input.scripts.map((script) => scriptSection(script).join('\n').trimEnd()).join('\n\n---\n\n')
  return `${body}\n`
}

const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

export const scriptFileName = (title: string, format: 'md' | 'json') => `guion-${slug(title) || 'sin-titulo'}.${format}`

export const scriptsFileName = (displayName: string | null, format: 'md' | 'json') =>
  `guiones-${slug(displayName ?? '') || 'de-mi-canal'}.${format}`
