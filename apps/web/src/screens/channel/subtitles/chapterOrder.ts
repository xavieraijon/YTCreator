import type { SubtitleChapter } from '@ytcreator/core/api'

// Which real minutes can be put without YouTube refusing the chapters, worked out as the server will (006, R3 and
// `assertSpacing`): said before asking, never after the confirmation (novice audit, decision 60).

/** Within this, a difference is what the audio can tell (SC-005): it is shown, but not marked at first. */
export const PRECISION_SECONDS = 2

/** A minute to put: the real one (`seconds === real`) or one the creator writes. */
export interface Accepted {
  readonly chapterId: string
  readonly seconds: number
}

/** Chapters heard before one that comes earlier in the script: the edit changed their order. */
export const outOfOrder = (chapters: readonly SubtitleChapter[]) => {
  const out = new Set<string>()
  let latest = 0
  chapters.forEach((one, index) => {
    if (index === 0 || one.real === null) return
    if (one.real <= latest) out.add(one.chapterId)
    latest = Math.max(latest, one.real)
  })
  return out
}

/**
 * The chapters left out of order, or too close to the one before, once these are put. Each accepted minute stays; the
 * estimated ones after a new minute move by as much (R3 of 006); the ones written by hand or real stay as they are; the
 * removed ones are left out. Next to a real minute only the order counts (decision 46); between the others, at least
 * `minSeconds`.
 */
export function unplaceable(
  chapters: readonly SubtitleChapter[],
  accept: readonly Accepted[],
  removed: ReadonlySet<string>,
  minSeconds: number,
): Set<string> {
  let shift = 0
  const times = chapters
    .filter((one) => !removed.has(one.chapterId))
    .map((one, index) => {
      const chosen = accept.find((it) => it.chapterId === one.chapterId)
      if (index === 0) return { chapterId: one.chapterId, seconds: 0, real: false }
      if (chosen) {
        shift = chosen.seconds - one.estimated
        return { chapterId: one.chapterId, seconds: chosen.seconds, real: chosen.seconds === one.real }
      }
      if (one.manual || one.fromAudio) {
        shift = 0
        return { chapterId: one.chapterId, seconds: one.estimated, real: one.fromAudio }
      }
      return { chapterId: one.chapterId, seconds: one.estimated + shift, real: false }
    })
  const bad = new Set<string>()
  times.forEach((one, index) => {
    const before = times[index - 1]
    if (!before) return
    if (one.seconds - before.seconds < (one.real || before.real ? 1 : minSeconds)) {
      bad.add(before.chapterId)
      bad.add(one.chapterId)
    }
  })
  return bad
}

/**
 * Marked at first: the ones that change beyond what the audio can tell, except those written by hand or out of order,
 * and only as many as can be put (a chapter moved before one left as it is would be refused).
 */
export function markedAtFirst(chapters: readonly SubtitleChapter[], minSeconds: number): Set<string> {
  const disordered = outOfOrder(chapters)
  const marked = new Set(
    chapters
      .filter(
        (one, index) =>
          index > 0 &&
          one.real !== null &&
          Math.abs(one.real - one.estimated) > PRECISION_SECONDS &&
          !one.manual &&
          !disordered.has(one.chapterId),
      )
      .map((one) => one.chapterId),
  )
  const acceptOf = () =>
    chapters.flatMap((one) =>
      marked.has(one.chapterId) && one.real !== null ? [{ chapterId: one.chapterId, seconds: one.real }] : [],
    )
  // Each round takes out the marked one nearest before (or at) the later chapter of the first pair that fails: a marked
  // minute moves the estimated ones after it. Every round marks one fewer, so it ends; with none to take out, it stops.
  for (;;) {
    const bad = unplaceable(chapters, acceptOf(), new Set(), minSeconds)
    const indices = chapters.flatMap((one, index) => (bad.has(one.chapterId) ? [index] : []))
    const at = indices[1] ?? indices[0] ?? -1
    const culprit = chapters.slice(0, at + 1).findLast((one) => marked.has(one.chapterId))
    if (bad.size === 0 || !culprit) return marked
    marked.delete(culprit.chapterId)
  }
}
