import { z } from 'zod'
import { editDistance, normalizeWord } from './align.ts'
import { type Cue, SUBTITLE_LIMITS } from './model.ts'

// The AI's review of the subtitles (research.md R11, contracts/ai-uses.md): it only fixes how they are written. It
// never sees the times, so it cannot move them; a change that rewrites what was said is refused.

export const REVIEW_BATCH = 200
/** Over this share of edit distance a change is a rewrite, not a fix of how it is written. */
export const REVIEW_MAX_DISTANCE = 0.3
export const REVIEW_REASON_CHARS = 120

/** The cues of a long video, sent in batches of up to 200, with their id and text only. */
export function reviewBatches(cues: readonly Cue[]): { id: string; text: string }[][] {
  const batches: { id: string; text: string }[][] = []
  for (let i = 0; i < cues.length; i += REVIEW_BATCH)
    batches.push(cues.slice(i, i + REVIEW_BATCH).map(({ id, text }) => ({ id, text })))
  return batches
}

// What any answer has to look like; reviewOutputFor adds what only the batch and the script know.
export const reviewOutput = z.object({
  changes: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string(),
        reason: z.string().trim().min(1).max(REVIEW_REASON_CHARS),
      }),
    )
    .max(REVIEW_BATCH),
})
export type ReviewOutput = z.infer<typeof reviewOutput>

const wordsOf = (text: string) =>
  text
    .split(/\s+/)
    .map(normalizeWord)
    .filter((word) => word !== '')

// The figures said, in order, as normalizeWord reads them («doscientos» and «200» are the same).
const figuresOf = (text: string) =>
  wordsOf(text)
    .filter((word) => /^\d+$/.test(word))
    .join(' ')

/** The output for one batch: each change of a cue in it, once, a fix of writing and within the lines of its format. */
export function reviewOutputFor({
  batch,
  script,
  maxLines,
  glossary = [],
}: {
  batch: readonly { id: string; text: string }[]
  script: string
  maxLines: number
  /** What the creator already changed in all of them: the prompt asks to write it so (decision 36). */
  glossary?: readonly string[]
}) {
  const texts = new Map(batch.map((cue) => [cue.id, cue.text]))
  const known = new Set([...wordsOf(script), ...glossary.flatMap(wordsOf)])
  return reviewOutput.superRefine(({ changes }, context) => {
    const seen = new Set<string>()
    changes.forEach((change, i) => {
      const fail = (message: string) => context.addIssue({ code: 'custom', message, path: ['changes', i] })
      const before = texts.get(change.id)
      if (before === undefined) return fail('id_desconocido')
      if (seen.has(change.id)) return fail('repetido')
      seen.add(change.id)
      const text = change.text.trim()
      if (text === '') return fail('vacio')
      if (text === before) return fail('igual')
      if (text.split('\n').length > maxLines) fail('lineas')
      if (text.length > SUBTITLE_LIMITS.cueText) fail('largo')
      // Only capitals, accents or signs is always a fix of writing, however short the subtitle («si» → «Sí.»); the
      // 30 % holds for the rest (contracts/ai-uses.md).
      const same = wordsOf(text).join(' ') === wordsOf(before).join(' ')
      if (!same && editDistance(before, text) > REVIEW_MAX_DISTANCE * before.length) fail('distancia')
      // Other capitals, accents or signs are the same word (normalizeWord); a new one is not a fix of writing.
      const had = new Set(wordsOf(before))
      if (wordsOf(text).some((word) => !had.has(word) && !known.has(word))) fail('palabra_nueva')
      // A figure is what was said: never the script's one instead, even if it is there (FR-011).
      if (figuresOf(text) !== figuresOf(before)) fail('cifra')
    })
  })
}
