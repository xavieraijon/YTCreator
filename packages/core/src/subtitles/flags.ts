import type { ComputedCueMark } from '../api/subtitles.ts'
import type { Cue, HeardWord } from './model.ts'
import type { SubtitleLimits } from './segment.ts'

// What is marked for the creator to look at (research.md R10). «Lectura rápida» and «fuera de límites» are worked out
// every time from the text and the times, never kept: an edit can make them come or go (FR-010).

const EPSILON = 1e-9

/** The reading marks of one cue against the limits of its format. */
export function readingMarks(cue: Pick<Cue, 'start' | 'end' | 'text'>, limits: SubtitleLimits): ComputedCueMark[] {
  const marks: ComputedCueMark[] = []
  const seconds = cue.end - cue.start
  const lines = cue.text.split('\n')
  const chars = lines.join(' ').length
  if (seconds > 0 && chars / seconds > limits.maxCharsPerSecond + EPSILON) marks.push('lectura_rapida')
  if (
    lines.length > limits.maxLines ||
    lines.some((line) => line.length > limits.maxCharsPerLine) ||
    seconds < limits.minSeconds - EPSILON ||
    seconds > limits.maxSeconds + EPSILON
  )
    marks.push('fuera_de_limites')
  return marks
}

/** The worked-out marks of a version, only for the cues that have some. */
export function cueMarks(cues: readonly Cue[], limits: SubtitleLimits): Record<string, ComputedCueMark[]> {
  const marks: Record<string, ComputedCueMark[]> = {}
  cues.forEach((cue, i) => {
    const found = readingMarks(cue, limits)
    // Over the one before it: both would be on screen at once (AS2 of US2).
    if (i > 0 && cue.start < cues[i - 1]!.end - EPSILON) found.push('solapado')
    if (found.length > 0) marks[cue.id] = found
  })
  return marks
}

/** «No se oyó bien»: some word under the threshold (its probability is already the mean of its fragments). */
export const hasLowConfidence = (words: readonly HeardWord[], threshold: number): boolean =>
  words.some((word) => word.p < threshold)

/** «Entendió poco»: the figures of the knowledge package (assumptions of this app, decision 58). */
export interface HeardLittleRule {
  readonly lowConfidence: number
  readonly lowShare: number
  readonly wordsPerMinute: number
}

/**
 * Whether the recognition understood little of the audio (spec, edge case «Audio en otro idioma o casi sin voz»): then
 * every subtitle is marked to be looked at. Nothing heard is the other case, «casi sin voz», not this one.
 */
export function heardLittle(words: readonly HeardWord[], audioSeconds: number, rule: HeardLittleRule): boolean {
  if (words.length === 0 || audioSeconds <= 0) return false
  const low = words.filter((word) => word.p < rule.lowConfidence).length
  return low / words.length >= rule.lowShare || words.length / (audioSeconds / 60) < rule.wordsPerMinute
}

/** The cues with some mark, kept or worked out, that the creator has not marked as reviewed. */
export const countToReview = (cues: readonly Cue[], marks: Record<string, readonly ComputedCueMark[]>): number =>
  cues.filter((cue) => !cue.reviewed && (cue.flags.length > 0 || (marks[cue.id]?.length ?? 0) > 0)).length
