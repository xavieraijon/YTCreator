import type { IdeaFormat } from '../ideas/model.ts'

// What the creator sees is worked out from the versions, so it can never disagree with them (research.md R2).
export const SCRIPT_STATUSES = [
  'sin_empezar',
  'escaleta_borrador',
  'escaleta_aprobada',
  'guion_borrador',
  'guion_aprobado',
] as const
export type ScriptStatus = (typeof SCRIPT_STATUSES)[number]

export interface ScriptStatusInput {
  format: IdeaFormat
  latestOutline: number | null
  approvedOutline: number | null
  latestDraft: number | null
  approvedDraft: number | null
}

export function scriptStatus({ latestOutline, approvedOutline, latestDraft, approvedDraft }: ScriptStatusInput): ScriptStatus {
  if (latestDraft !== null) return latestDraft === approvedDraft ? 'guion_aprobado' : 'guion_borrador'
  if (latestOutline === null) return 'sin_empezar'
  return latestOutline === approvedOutline ? 'escaleta_aprobada' : 'escaleta_borrador'
}

export const SCRIPT_WARNINGS = [
  'idea_cambiada',
  'perfil_cambiado',
  'hechos_cambiados',
  'escaleta_cambiada',
  'origen_cambiado',
] as const
export type ScriptWarning = (typeof SCRIPT_WARNINGS)[number]

export interface ScriptWarningInput {
  ideaRevision: number
  profileVersion: number
  /** The last thing written: the draft, or else the outline. */
  current: { ideaRevision: number; profileVersion: number; factsVersion: number | null } | null
  latestFacts: number | null
  latestOutline: number | null
  /** The outline the current draft was written with. */
  draftOutline: number | null
  /** The long script a Short came from: its last draft, and the one the Short was drawn from. */
  source: { latestDraft: number | null; usedDraft: number | null } | null
}

// Nothing changes on its own: the creator is told what moved since this was written (data-model.md, «Avisos»).
export function scriptWarnings(input: ScriptWarningInput): ScriptWarning[] {
  const { current, latestFacts, latestOutline, draftOutline, source } = input
  const warnings: ScriptWarning[] = []
  if (current) {
    if (input.ideaRevision > current.ideaRevision) warnings.push('idea_cambiada')
    if (input.profileVersion > current.profileVersion) warnings.push('perfil_cambiado')
    if ((latestFacts ?? 0) > (current.factsVersion ?? 0)) warnings.push('hechos_cambiados')
  }
  if (draftOutline !== null && (latestOutline ?? 0) > draftOutline) warnings.push('escaleta_cambiada')
  if (source && (source.latestDraft ?? 0) > (source.usedDraft ?? 0)) warnings.push('origen_cambiado')
  return warnings
}
