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
  for (const cue of cues) {
    const found = readingMarks(cue, limits)
    if (found.length > 0) marks[cue.id] = found
  }
  return marks
}

/** «No se oyó bien»: some word under the threshold (its probability is already the mean of its fragments). */
export const hasLowConfidence = (words: readonly HeardWord[], threshold: number): boolean =>
  words.some((word) => word.p < threshold)

/** The cues with some mark, kept or worked out, that the creator has not marked as reviewed. */
export const countToReview = (cues: readonly Cue[], marks: Record<string, readonly ComputedCueMark[]>): number =>
  cues.filter((cue) => !cue.reviewed && (cue.flags.length > 0 || (marks[cue.id]?.length ?? 0) > 0)).length
