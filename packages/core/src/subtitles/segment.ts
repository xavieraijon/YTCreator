import type { Cue, CueFlag, HeardWord } from './model.ts'
import { hasLowConfidence } from './flags.ts'

// From the heard words to subtitles within the reading limits of subtitles/craft.json (research.md R8, SC-002).

export interface SubtitleLimits {
  maxLines: number
  maxCharsPerLine: number
  maxCharsPerSecond: number
  minSeconds: number
  maxSeconds: number
  minGapSeconds: number
}

/** A heard word after the script corrected it: `heard` keeps what was heard when it changed (R9). */
export type AlignedWord = HeardWord & { heard: string | null }

export interface SegmentOptions {
  audioSeconds: number
  /** Below this probability a word is marked «no se oyó bien» (R10). */
  lowConfidence: number
}

// Where a subtitle may end, from best to worst (R8).
const SENTENCE_END = /[.!?…]["»”)]*$/
const CLAUSE_END = /[,;:]["»”)]*$/
const LINKS = new Set([
  'y',
  'e',
  'ni',
  'o',
  'u',
  'pero',
  'sino',
  'que',
  'porque',
  'aunque',
  'pues',
  'cuando',
  'como',
  'si',
  'mientras',
  'donde',
  'a',
  'al',
  'ante',
  'bajo',
  'con',
  'contra',
  'de',
  'del',
  'desde',
  'durante',
  'en',
  'entre',
  'hacia',
  'hasta',
  'mediante',
  'para',
  'por',
  'según',
  'sin',
  'sobre',
  'tras',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'lo',
  'su',
  'sus',
  'mi',
  'mis',
  'tu',
  'tus',
])
const bare = (word: string) => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const isLink = (word: string) => LINKS.has(bare(word))

const PAUSE_MS = 500
// A subtitle may stay up to this long after the next words start, pushing the next one back, so it can be read
// (decision 18). The lag never adds up: the next one ends with its own words.
const LAG_MS = 500

/** The best way to lay the words of a subtitle on its lines; null when they do not fit. */
function bestLines(tokens: readonly string[], limits: SubtitleLimits): { lines: string[]; cost: number } | null {
  const joined = tokens.join(' ')
  if (joined.length <= limits.maxCharsPerLine) return { lines: [joined], cost: 0 }
  if (limits.maxLines < 2 || tokens.length < 2) return null
  let best: { lines: string[]; cost: number } | null = null
  for (let k = 1; k < tokens.length; k++) {
    const first = tokens.slice(0, k).join(' ')
    const second = tokens.slice(k).join(' ')
    if (first.length > limits.maxCharsPerLine || second.length > limits.maxCharsPerLine) continue
    let cost = Math.abs(first.length - second.length)
    // Never one word alone on a line if it can be helped.
    if (k === 1 || k === tokens.length - 1) cost += 100
    const before = tokens[k - 1]!
    if (SENTENCE_END.test(before)) cost -= 14
    else if (CLAUSE_END.test(before)) cost -= 10
    else if (isLink(tokens[k]!)) cost -= 5
    if (isLink(before)) cost += 12
    if (!best || cost < best.cost) best = { lines: [first, second], cost }
  }
  return best
}

/** The lines of a subtitle: one if it fits, else two alike, cut where reading flows best. */
export function splitLines(tokens: readonly string[], limits: SubtitleLimits): string[] {
  return bestLines(tokens, limits)?.lines ?? [tokens.join(' ')]
}

const ms = (seconds: number) => Math.round(seconds * 1000)

export function segment(words: readonly AlignedWord[], limits: SubtitleLimits, options: SegmentOptions): Cue[] {
  const n = words.length
  if (n === 0) return []
  const audioMs = ms(options.audioSeconds)
  const gapMs = Math.ceil(limits.minGapSeconds * 1000)
  const minMs = Math.ceil(limits.minSeconds * 1000)
  const maxMs = Math.floor(limits.maxSeconds * 1000)
  const startOf = (i: number) => ms(words[i]!.start)
  const endOf = (i: number) => ms(words[i]!.end)
  const readingMs = (chars: number) => Math.ceil((chars * 1000) / limits.maxCharsPerSecond)

  // How good a cut after word j - 1 is: a sentence end, a pause, a comma, before a link word, anywhere.
  const cutCost = (j: number) => {
    if (j >= n) return 0
    const before = words[j - 1]!.text
    let cost = 10
    if (SENTENCE_END.test(before)) cost = 0
    else if (startOf(j) - endOf(j - 1) > PAUSE_MS) cost = 1
    else if (CLAUSE_END.test(before)) cost = 2
    else if (isLink(words[j]!.text)) cost = 4
    // A link word left hanging at the end reads badly.
    if (isLink(before)) cost += 15
    return cost
  }

  // The fewest, best cut subtitles (dynamic programming over where each one ends).
  const best = new Float64Array(n + 1).fill(Number.POSITIVE_INFINITY)
  const from = new Int32Array(n + 1).fill(-1)
  best[0] = 0
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(best[i]!)) continue
    const tokens: string[] = []
    let chars = -1
    for (let j = i + 1; j <= n; j++) {
      const token = words[j - 1]!.text
      tokens.push(token)
      chars += token.length + 1
      const alone = j === i + 1
      if (!alone && chars > limits.maxLines * limits.maxCharsPerLine) break
      const span = endOf(j - 1) - startOf(i)
      if (!alone && span > maxMs) break
      const lines = bestLines(tokens, limits)
      if (!lines && !alone) continue
      // The time this subtitle can stay on screen before the next one.
      const room = Math.min(maxMs, (j < n ? startOf(j) + LAG_MS - gapMs : audioMs) - startOf(i))
      let cost = 3 + (lines ? lines.cost * 0.1 : 50) + cutCost(j)
      const need = readingMs(chars)
      // Reading too fast or too short is worse than any cut: only when nothing else fits.
      if (need > room) cost += 200 + (need - room) / 10
      if (room < minMs) cost += 200
      if (alone && n > 1) cost += 6
      if (best[i]! + cost < best[j]!) {
        best[j] = best[i]! + cost
        from[j] = i
      }
    }
  }

  const bounds: [number, number][] = []
  for (let j = n; j > 0; j = from[j]!) bounds.unshift([from[j]!, j])

  // Times: from the first word, long enough to read and to stay the minimum, never over the next one.
  const cues: Cue[] = []
  let previousEnd = Number.NEGATIVE_INFINITY
  bounds.forEach(([i, j], index) => {
    const slice = words.slice(i, j)
    const text = splitLines(
      slice.map((word) => word.text),
      limits,
    ).join('\n')
    const chars = text.replace(/\n/g, ' ').length
    // Each cue still to come keeps a millisecond before the end of the audio, so cues squeezed there never overlap.
    const left = bounds.length - index
    const start = Math.min(Math.max(startOf(i), previousEnd + gapMs), audioMs - left)
    const lastWordEnd = Math.max(endOf(j - 1), start + 1)
    let end = Math.max(lastWordEnd, start + minMs, start + readingMs(chars))
    end = Math.min(end, start + maxMs)
    const next = bounds[index + 1]
    if (next) end = Math.min(end, Math.max(startOf(next[0]) + LAG_MS - gapMs, lastWordEnd))
    end = Math.max(Math.min(end, audioMs - left + 1), start + 1)
    previousEnd = end

    const corrected = slice.some((word) => word.heard !== null)
    const flags: CueFlag[] = []
    if (corrected) flags.push('del_guion')
    if (hasLowConfidence(slice, options.lowConfidence)) flags.push('poca_seguridad')
    cues.push({
      id: `c${index + 1}`,
      start: start / 1000,
      end: end / 1000,
      text,
      flags,
      // A heard word put in the place of two or three keeps '' in the others: no double spaces.
      heard: corrected
        ? slice
            .map((word) => word.heard ?? word.text)
            .filter((word) => word !== '')
            .join(' ')
        : null,
      reviewed: false,
    })
  })
  return cues
}
