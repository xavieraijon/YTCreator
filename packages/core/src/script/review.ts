import { durationSeconds } from './duration.ts'
import type { Claim, DraftBlock } from './model.ts'
import { occurrences } from './claims.ts'
import type { IdeaFormat } from '../ideas/model.ts'

// The free review of a script: nothing here calls the AI or stops anything (research.md R14, FR-015, FR-016).
export interface ScriptReviewRules {
  readonly maxSentenceWords: number
  readonly hookMaxSeconds: { readonly largo: number; readonly short: number }
  readonly durationTolerance: number
  readonly fillers: readonly string[]
}

export type ReviewNotice =
  | { readonly rule: 'duracion'; readonly blockId: string; readonly seconds: number; readonly target: number }
  | { readonly rule: 'gancho_largo'; readonly blockId: string; readonly seconds: number; readonly limit: number }
  | {
      readonly rule: 'short_largo'
      readonly blockId: string
      readonly seconds: number
      readonly limit: number
      readonly excess: number
    }
  | { readonly rule: 'muletilla'; readonly blockId: string; readonly text: string }
  | { readonly rule: 'frase_larga'; readonly blockId: string; readonly text: string; readonly words: number }
  | { readonly rule: 'por_comprobar'; readonly blockId: string; readonly count: number }

export interface ReviewInput {
  readonly format: IdeaFormat
  readonly targetSeconds: number
  readonly wordsPerMinute: number
  readonly blocks: readonly DraftBlock[]
  readonly claims: readonly Claim[]
  readonly rules: ScriptReviewRules
  /** The most a Short can last, from whoever asks: `core` does not read the knowledge package. */
  readonly shortMaxSeconds: number
}

// A full stop inside «1.200» has no space after it, so it does not end a sentence.
const sentencesOf = (text: string) =>
  text
    .split(/(?<=[.!?…][»"”)]?)\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')

const wordsOf = (sentence: string) => sentence.split(/\s+/u).length

export function reviewScript({
  format,
  targetSeconds,
  wordsPerMinute,
  blocks,
  claims,
  rules,
  shortMaxSeconds,
}: ReviewInput): ReviewNotice[] {
  const notices: ReviewNotice[] = []
  const secondsOf = (block: DraftBlock) => durationSeconds(block.text, wordsPerMinute)

  const total = durationSeconds(blocks.map((block) => block.text).join(' '), wordsPerMinute)
  // Where it can be fixed: the longest block if it runs over, the shortest if it falls short.
  const sorted = [...blocks].sort((a, b) => secondsOf(a) - secondsOf(b))
  if (format === 'short' && total > shortMaxSeconds) {
    const excess = total - shortMaxSeconds
    notices.push({ rule: 'short_largo', blockId: sorted.at(-1)!.id, seconds: total, limit: shortMaxSeconds, excess })
  } else if (blocks.length > 0 && Math.abs(total - targetSeconds) > targetSeconds * rules.durationTolerance) {
    const block = total > targetSeconds ? sorted.at(-1)! : sorted[0]!
    notices.push({ rule: 'duracion', blockId: block.id, seconds: total, target: targetSeconds })
  }

  const hook = blocks.find((block) => block.type === 'gancho')
  const limit = rules.hookMaxSeconds[format]
  if (hook && secondsOf(hook) > limit) {
    notices.push({ rule: 'gancho_largo', blockId: hook.id, seconds: secondsOf(hook), limit })
  }

  for (const block of blocks) {
    const lower = block.text.toLocaleLowerCase('es')
    for (const filler of rules.fillers) {
      if (occurrences(lower, filler.toLocaleLowerCase('es')).length > 0) {
        notices.push({ rule: 'muletilla', blockId: block.id, text: filler })
      }
    }
    for (const sentence of sentencesOf(block.text)) {
      const words = wordsOf(sentence)
      if (words > rules.maxSentenceWords)
        notices.push({ rule: 'frase_larga', blockId: block.id, text: sentence, words })
    }
    const count = claims.filter((claim) => claim.blockId === block.id && claim.status === 'pendiente').length
    if (count > 0) notices.push({ rule: 'por_comprobar', blockId: block.id, count })
  }
  return notices
}
