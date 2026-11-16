import type { HeardWord } from '@ytcreator/core'

interface Token {
  text?: unknown
  offsets?: { from?: unknown; to?: unknown }
  p?: unknown
}

/** One stretch of voice the detection kept: where it is in the audio and in what whisper heard (seconds). */
export interface VadSegment {
  origStart: number
  origEnd: number
  vadStart: number
  vadEnd: number
}

const VAD_LINE =
  /vad_segment_info: orig_start: (\d+(?:\.\d+)?), orig_end: (\d+(?:\.\d+)?), vad_start: (\d+(?:\.\d+)?), vad_end: (\d+(?:\.\d+)?)/

/** A stretch of voice from a line of whisper-cli's messages, or null: only times, never what was said. */
export function parseVadLine(line: string): VadSegment | null {
  const match = VAD_LINE.exec(line)
  if (!match) return null
  const [origStart, origEnd, vadStart, vadEnd] = match.slice(1).map(Number) as [number, number, number, number]
  return { origStart, origEnd, vadStart, vadEnd }
}

/**
 * A time of what whisper heard put back in the audio. With the voice detection on, whisper.cpp b5454 hears only the
 * voice, one stretch after another; it puts the fragments back in the audio's times, but `-ojf` gives each word in
 * the voice's own (T075, decision 62). This is the library's `whisper_map_token_time_segment_aware`: inside a stretch,
 * in proportion; in the gap between two, to the nearer edge.
 */
export function toAudioTime(t: number, segments: readonly VadSegment[]): number {
  const first = segments[0]
  const last = segments.at(-1)
  if (!first || !last) return t
  if (t <= first.vadStart) return first.origStart
  if (t >= last.vadEnd) return last.origEnd
  for (let i = 0; i < segments.length; i++) {
    const one = segments[i]!
    if (t >= one.vadStart && t <= one.vadEnd) {
      const span = one.vadEnd - one.vadStart
      return span <= 0 ? one.origStart : one.origStart + ((t - one.vadStart) * (one.origEnd - one.origStart)) / span
    }
    const next = segments[i + 1]
    if (next && t > one.vadEnd && t < next.vadStart)
      return t <= (one.vadEnd + next.vadStart) / 2 ? one.origEnd : next.origStart
  }
  return t
}

/**
 * Where a word starts that runs over a silence the detection cut. Whisper starts the first word after a pause where
 * the one before ended (T075); no word is said in a silence, so it starts where the voice comes back.
 */
export function afterSilence(start: number, end: number, segments: readonly VadSegment[]): number {
  let from = start
  // The last silence it runs over, should it run over more than one.
  for (let i = 0; i + 1 < segments.length; i++) {
    const back = segments[i + 1]!.origStart
    if (start <= segments[i]!.origEnd && end >= back) from = back
  }
  return from
}

const SENTENCE_END = /[.!?…]["»”)]*$/
const PAUSE_END = /[.!?…,;:]["»”)]*$/

/**
 * The first word of a stretch of voice that whisper left at the end of the one before. Whisper.cpp b5454 leaves only
 * 0.1 s of silence between two stretches, and near it its times come up to a second early (T075): a word after one
 * that ends a sentence, with no sign of its own, whose next word is already in the next stretch, is the first of the
 * next one (speech pauses where a text has a sign, not after the first word of a sentence). A word that ends a
 * sentence or a clause itself stays: it is the last of its stretch.
 */
export function startsOfStretches(words: HeardWord[], segments: readonly VadSegment[]): void {
  for (let k = 1; k + 1 < words.length; k++) {
    const word = words[k]!
    const next = words[k + 1]!
    if (!SENTENCE_END.test(words[k - 1]!.text) || PAUSE_END.test(word.text)) continue
    for (let i = 0; i + 1 < segments.length; i++) {
      const { origEnd } = segments[i]!
      const back = segments[i + 1]!.origStart
      if (word.start < origEnd && word.end <= origEnd && next.start >= back) {
        const lasted = word.end - word.start
        word.start = back
        word.end = round(Math.max(back, Math.min(next.start, back + lasted)))
        break
      }
    }
  }
}

const WORD_LIMIT = 100
const isSpecial = (text: string) => /^\[_.*\]$/.test(text) || /^<\|.*\|>$/.test(text)
const hasLetter = (text: string) => /[\p{L}\p{N}]/u.test(text)

/**
 * The words of whisper-cli's full JSON (`-ojf`). A word starts at a fragment that begins with a space; its times go from
 * its first fragment to its last, and its probability is the mean of theirs (R10). The file is read as bytes: a
 * fragment can hold half of a «ñ», so the bytes of a word are joined before they are read as UTF-8.
 */
export function parseWhisperJson(
  bytes: Buffer,
  audioSeconds: number,
  segments: readonly VadSegment[] = [],
): HeardWord[] {
  const data = JSON.parse(bytes.toString('latin1')) as { transcription?: { tokens?: Token[] }[] }
  const words: HeardWord[] = []
  let current: { bytes: Buffer[]; start: number; end: number; p: number[] } | null = null
  const close = () => {
    if (!current) return
    const text = Buffer.concat(current.bytes).toString('utf8').trim().slice(0, WORD_LIMIT)
    const p = current.p.reduce((sum, value) => sum + value, 0) / current.p.length
    // In whole milliseconds, never past the end of the audio (rounded down, so it stays inside).
    const last = Math.floor(audioSeconds * 1000) / 1000
    const start = Math.min(round(Math.max(0, afterSilence(current.start, current.end, segments))), last)
    const end = Math.min(Math.max(start, round(current.end)), last)
    current = null
    if (!text) return
    const previous = words.at(-1)
    // Signs said on their own («-», «¿») go with the word before, as a subtitle shows them.
    if (!hasLetter(text) && previous) {
      previous.text = `${previous.text}${text}`.slice(0, WORD_LIMIT)
      return
    }
    words.push({ text, start, end, p: round(Math.min(1, Math.max(0, p))) })
  }
  for (const segment of data.transcription ?? []) {
    for (const token of segment.tokens ?? []) {
      if (typeof token.text !== 'string' || token.text === '' || isSpecial(token.text)) continue
      const from = toAudioTime(Number(token.offsets?.from) / 1000, segments)
      const to = toAudioTime(Number(token.offsets?.to) / 1000, segments)
      const p = Number(token.p)
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue
      const raw = Buffer.from(token.text, 'latin1')
      if (!current || raw[0] === 0x20) {
        close()
        current = { bytes: [], start: from, end: to, p: [] }
      }
      current.bytes.push(raw)
      current.end = Math.max(current.end, to)
      if (Number.isFinite(p)) current.p.push(p)
    }
  }
  close()
  startsOfStretches(words, segments)
  return words
}

const round = (value: number) => Math.round(value * 1000) / 1000
