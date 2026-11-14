import type { IdeaFormat } from '../ideas/model.ts'
import { formatKinds, type PackageKind, type PackageStep, stepKinds } from './model.ts'

// What the creator sees is worked out from the versions, so it can never disagree with them (research.md R2).
export const PACKAGE_STATUSES = [
  'sin_empezar',
  'portada_borrador',
  'portada_aprobada',
  'textos_borrador',
  'textos_aprobados',
  'aprobado',
] as const
export type PackageStatus = (typeof PACKAGE_STATUSES)[number]

/** Which version of each kind: the last one, or the one approved in a step. */
export type KindVersions = Partial<Record<PackageKind, number>>

export interface PackageStatusInput {
  format: IdeaFormat
  latest: KindVersions
  cover: KindVersions | null
  texts: KindVersions | null
  approved: KindVersions | null
}

const matches = (kinds: readonly PackageKind[], latest: KindVersions, approved: KindVersions | null) =>
  approved !== null && kinds.every((kind) => latest[kind] !== undefined && approved[kind] === latest[kind])

/** Whether a step is approved in the last version of each of its pieces. */
export const stepApproved = (
  format: IdeaFormat,
  step: PackageStep,
  latest: KindVersions,
  approved: KindVersions | null,
) => matches(stepKinds(format, step), latest, approved)

export function packageStatus({ format, latest, cover, texts, approved }: PackageStatusInput): PackageStatus {
  if (latest.titulos === undefined) return 'sin_empezar'
  if (!stepApproved(format, 'portada', latest, cover)) return 'portada_borrador'
  if (latest.descripcion === undefined) return 'portada_aprobada'
  if (!stepApproved(format, 'textos', latest, texts)) return 'textos_borrador'
  return matches(formatKinds(format), latest, approved) ? 'aprobado' : 'textos_aprobados'
}

export const PACKAGE_WARNINGS = [
  'guion_cambiado',
  'guion_sin_aprobar',
  'titulo_cambiado',
  'parte_fija_cambiada',
  'sin_fuentes',
  'pendientes_en_guion',
] as const
export type PackageWarning = (typeof PACKAGE_WARNINGS)[number]

// The pieces that are made for a main title (data-model.md, `main_title`).
const FOR_A_TITLE: readonly PackageKind[] = ['miniaturas', 'descripcion', 'portada_short']

export interface PackageWarningInput {
  /** Whether the script is in `guion_aprobado`. */
  scriptApproved: boolean
  /** The approved version of the script's draft, if any. */
  scriptApprovedDraft: number | null
  /** Claims left to check when the script was approved. */
  pendingInScript: number
  /** The last version of each piece. */
  pieces: { kind: PackageKind; draftVersion: number; mainTitle: string | null }[]
  currentMainTitle: string | null
  /** The fixed part copied in the last description, or `null` without one. */
  descriptionFixedText: string | null
  currentFixedText: string
  /** Links and references the facts give to the description. */
  sourcesCount: number
}

// Nothing changes on its own: the creator is told what moved since each piece was made (research.md R16).
export function packageWarnings(input: PackageWarningInput): PackageWarning[] {
  const warnings: PackageWarning[] = []
  const { pieces } = input
  if (input.scriptApprovedDraft !== null && pieces.some((piece) => piece.draftVersion !== input.scriptApprovedDraft))
    warnings.push('guion_cambiado')
  if (!input.scriptApproved) warnings.push('guion_sin_aprobar')
  if (
    pieces.some(
      (piece) =>
        FOR_A_TITLE.includes(piece.kind) && piece.mainTitle !== null && piece.mainTitle !== input.currentMainTitle,
    )
  )
    warnings.push('titulo_cambiado')
  if (input.descriptionFixedText !== null && input.descriptionFixedText !== input.currentFixedText)
    warnings.push('parte_fija_cambiada')
  if (pieces.some((piece) => piece.kind === 'descripcion') && input.sourcesCount === 0) warnings.push('sin_fuentes')
  if (input.pendingInScript > 0) warnings.push('pendientes_en_guion')
  return warnings
}
