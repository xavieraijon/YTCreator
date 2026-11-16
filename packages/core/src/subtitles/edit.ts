import type { Cue } from './model.ts'
import { type SubtitleLimits, splitLines } from './segment.ts'

// What the creator does to the subtitles by hand (FR-008, FR-009, FR-010). Each one gives new cues and never blocks on
// the reading limits: going past them is allowed, and the marks worked out in flags.ts say so.

export type EditErrorCode = 'no_encontrado' | 'tiempos' | 'posicion' | 'ultimo' | 'vacio'

export class EditError extends Error {
  readonly code: EditErrorCode
  constructor(code: EditErrorCode) {
    super(code)
    this.code = code
    this.name = 'EditError'
  }
}

const ms = (seconds: number) => Math.round(seconds * 1000) / 1000

const indexOf = (cues: readonly Cue[], id: string) => {
  const at = cues.findIndex((cue) => cue.id === id)
  if (at < 0) throw new EditError('no_encontrado')
  return at
}

// The order of the file is the order of the starts; equal starts keep the order they had.
const byStart = (cues: Cue[]) =>
  cues
    .map((cue, i) => ({ cue, i }))
    .sort((a, b) => a.cue.start - b.cue.start || a.i - b.i)
    .map(({ cue }) => cue)

/** An id no cue has: `c` and the next number. */
export function nextCueId(cues: readonly Cue[]): string {
  let max = 0
  for (const cue of cues) {
    const number = /^c(\d+)$/.exec(cue.id)?.[1]
    if (number) max = Math.max(max, Number(number))
  }
  return `c${max + 1}`
}

/** A new text, start or end for one cue. A text the creator writes counts as reviewed. */
export function editCue(
  cues: readonly Cue[],
  id: string,
  change: { text?: string; start?: number; end?: number },
  audioSeconds: number,
): Cue[] {
  const at = indexOf(cues, id)
  const before = cues[at]!
  const start = ms(change.start ?? before.start)
  const end = ms(change.end ?? before.end)
  if (!(start >= 0 && start < end && end <= audioSeconds)) throw new EditError('tiempos')
  let text = before.text
  if (change.text !== undefined) {
    text = change.text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n')
    if (text === '') throw new EditError('vacio')
  }
  const edited: Cue = {
    ...before,
    start,
    end,
    text,
    reviewed: change.text !== undefined && text !== before.text ? true : before.reviewed,
  }
  return byStart(cues.map((cue, i) => (i === at ? edited : cue)))
}

/** Two cues from one, cut at a place of its text; the time is shared by their characters. */
export function splitCue(cues: readonly Cue[], id: string, position: number, limits: SubtitleLimits): Cue[] {
  const at = indexOf(cues, id)
  const cue = cues[at]!
  const flat = cue.text.replace(/\n/g, ' ')
  const left = flat.slice(0, position).trim()
  const right = flat.slice(position).trim()
  if (position <= 0 || left === '' || right === '') throw new EditError('posicion')
  const middle = ms(cue.start + ((cue.end - cue.start) * left.length) / (left.length + right.length))
  if (!(middle > cue.start && middle < cue.end)) throw new EditError('tiempos')
  const lines = (text: string) => splitLines(text.split(' '), limits).join('\n')
  const first: Cue = { ...cue, end: middle, text: lines(left), reviewed: false }
  const second: Cue = { ...cue, id: nextCueId(cues), start: middle, text: lines(right), reviewed: false }
  return [...cues.slice(0, at), first, second, ...cues.slice(at + 1)]
}

/** One cue from it and the next one: their texts, from the start of the first to the end of the second. */
export function joinCues(cues: readonly Cue[], id: string, limits: SubtitleLimits): Cue[] {
  const at = indexOf(cues, id)
  const first = cues[at]!
  const second = cues[at + 1]
  if (!second) throw new EditError('ultimo')
  const flat = (cue: Cue) => cue.text.replace(/\n/g, ' ')
  const text = splitLines(`${flat(first)} ${flat(second)}`.split(' '), limits).join('\n')
  const flags = [...new Set([...first.flags, ...second.flags])]
  const heard =
    first.heard !== null || second.heard !== null
      ? `${first.heard ?? flat(first)} ${second.heard ?? flat(second)}`
      : null
  const joined: Cue = {
    ...first,
    end: Math.max(first.end, second.end),
    text,
    flags,
    heard,
    reviewed: first.reviewed && second.reviewed,
  }
  return [...cues.slice(0, at), joined, ...cues.slice(at + 2)]
}

/** The creator has looked at it: its marks stay, but it leaves «Para revisar» (R10). */
export function markReviewed(cues: readonly Cue[], id: string, reviewed: boolean): Cue[] {
  const at = indexOf(cues, id)
  return cues.map((cue, i) => (i === at ? { ...cue, reviewed } : cue))
}

// Whole words only: «pan» is not inside «Panadero». Exactly as written, capitals included.
const wholeWord = (from: string) =>
  new RegExp(`(?<![\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu')

/** How many cues a change in all of them would touch, to say it before (FR-009). */
export function replaceCount(cues: readonly Cue[], from: string): number {
  const pattern = wholeWord(from)
  return cues.filter((cue) => cue.text.search(pattern) >= 0).length
}

/** The change in every cue that has it, and how many changed. */
export function replaceAll(cues: readonly Cue[], from: string, to: string): { cues: Cue[]; count: number } {
  const pattern = wholeWord(from)
  let count = 0
  const changed = cues.map((cue) => {
    const text = cue.text.replace(pattern, () => to)
    if (text === cue.text) return cue
    count++
    return { ...cue, text }
  })
  return { cues: changed, count }
}

/**
 * The changes made in all of them, applied again in order to new subtitles: how many subtitles end up changed. A
 * subtitle that already says what the change writes is left as it is, so «Juan» → «Juan Pérez» never gives «Juan Pérez
 * Pérez» (the new recognition may come already written as in the script, R9).
 */
export function reapply(
  cues: readonly Cue[],
  replacements: readonly { from: string; to: string }[],
): { cues: Cue[]; count: number } {
  const changed = replacements.reduce<Cue[]>(
    (now, { from, to }) =>
      now.map((cue) => (cue.text.search(wholeWord(to)) >= 0 ? cue : replaceAll([cue], from, to).cues[0]!)),
    [...cues],
  )
  // A cue whose text ends as it was is the same cue: the one before is kept as is.
  const kept = changed.map((one, index) => (one.text === cues[index]!.text ? cues[index]! : one))
  return { cues: kept, count: kept.filter((one, index) => one !== cues[index]).length }
}
