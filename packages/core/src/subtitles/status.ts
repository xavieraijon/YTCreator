// What the creator sees is worked out from the versions, so it can never disagree with them (research.md R12).
export const SUBTITLE_STATUSES = ['sin_hacer', 'en_marcha', 'borrador', 'aprobados'] as const
export type SubtitleStatus = (typeof SUBTITLE_STATUSES)[number]

export interface SubtitlesStatusInput {
  /** The number of the last version, or null without versions. */
  latest: number | null
  approved: number | null
  /** The state of the last recognition job of the track, if any. */
  job: string | null
}

export function subtitlesStatus({ latest, approved, job }: SubtitlesStatusInput): SubtitleStatus {
  if (job === 'en_cola' || job === 'en_curso') return 'en_marcha'
  if (latest === null) return 'sin_hacer'
  return approved === latest ? 'aprobados' : 'borrador'
}
