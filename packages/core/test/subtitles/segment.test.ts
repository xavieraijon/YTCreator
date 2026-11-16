import { describe, expect, it } from 'vitest'
import type { HeardWord } from '../../src/subtitles/model.ts'
import { type AlignedWord, type SubtitleLimits, segment, splitLines } from '../../src/subtitles/segment.ts'

// The figures of subtitles/craft.json (decision 10).
const LONG: SubtitleLimits = {
  maxLines: 2,
  maxCharsPerLine: 42,
  maxCharsPerSecond: 17,
  minSeconds: 0.833,
  maxSeconds: 7,
  minGapSeconds: 0.083,
}
const SHORT: SubtitleLimits = { ...LONG, maxLines: 1, maxCharsPerLine: 32 }
const OPTIONS = { lowConfidence: 0.5 }

/** Words said at a steady pace (about 2,7 words a second, normal speech), with a pause after each «|». */
function spoken(text: string, { step = 0.37, pause = 0.8, p = 0.9 } = {}): HeardWord[] {
  const words: HeardWord[] = []
  let at = 0.5
  for (const token of text.split(' ')) {
    if (token === '|') {
      at += pause
      continue
    }
    const length = step * Math.max(0.6, Math.min(1.6, token.length / 5))
    words.push({ text: token, start: round(at), end: round(at + length * 0.85), p })
    at += length
  }
  return words
}
const round = (value: number) => Math.round(value * 1000) / 1000
const plain = (words: HeardWord[]): AlignedWord[] => words.map((word) => ({ ...word, heard: null }))

const TEXT =
  'Hoy vamos a hacer un pan casero sin amasar, que sale con una corteza crujiente y una miga muy tierna. | ' +
  'Necesitas harina de fuerza, agua, sal y un poco de levadura, y nada más. | ' +
  'Primero mezclamos todo en un bol grande hasta que no quede harina seca, y lo tapamos con un paño limpio. | ' +
  'Después lo dejamos reposar doce horas en un sitio templado, sin tocarlo, mientras la levadura hace su trabajo. | ' +
  'Al día siguiente verás que ha crecido mucho y que tiene burbujas por toda la superficie.'

function checkLimits(cues: ReturnType<typeof segment>, limits: SubtitleLimits, audioSeconds: number) {
  cues.forEach((cue, i) => {
    const lines = cue.text.split('\n')
    expect(lines.length, cue.text).toBeLessThanOrEqual(limits.maxLines)
    for (const line of lines) expect(line.length, line).toBeLessThanOrEqual(limits.maxCharsPerLine)
    const seconds = cue.end - cue.start
    expect(seconds, cue.text).toBeGreaterThanOrEqual(limits.minSeconds - 1e-9)
    expect(seconds, cue.text).toBeLessThanOrEqual(limits.maxSeconds + 1e-9)
    expect(cue.text.replace(/\n/g, ' ').length / seconds, cue.text).toBeLessThanOrEqual(limits.maxCharsPerSecond + 1e-9)
    expect(cue.end).toBeLessThanOrEqual(audioSeconds)
    const next = cues[i + 1]
    if (next)
      expect(next.start - cue.end, `${cue.text} → ${next.text}`).toBeGreaterThanOrEqual(limits.minGapSeconds - 1e-9)
  })
}

describe('segmenting the heard words into subtitles (R8)', () => {
  it('keeps every subtitle of a long video within the lines, characters, reading speed and durations', () => {
    const words = spoken(TEXT)
    const audioSeconds = words.at(-1)!.end + 2
    const cues = segment(plain(words), LONG, { ...OPTIONS, audioSeconds })
    expect(cues.length).toBeGreaterThan(5)
    checkLimits(cues, LONG, audioSeconds)
    // Nothing lost or reordered.
    expect(cues.map((cue) => cue.text.replace(/\n/g, ' ')).join(' ')).toBe(words.map((word) => word.text).join(' '))
  })

  it('a Short: one line of 32', () => {
    const words = spoken(TEXT)
    const audioSeconds = words.at(-1)!.end + 2
    const cues = segment(plain(words), SHORT, { ...OPTIONS, audioSeconds })
    checkLimits(cues, SHORT, audioSeconds)
    expect(cues.every((cue) => !cue.text.includes('\n'))).toBe(true)
  })

  it('cuts at the end of a sentence, a pause or a comma before anywhere else', () => {
    const words = spoken(TEXT)
    const cues = segment(plain(words), LONG, { ...OPTIONS, audioSeconds: words.at(-1)!.end + 2 })
    const endings = cues.slice(0, -1).map((cue) => cue.text.at(-1))
    const good = endings.filter((ending) => ending === '.' || ending === ',')
    // Most cuts fall on punctuation; a cut never leaves a conjunction or preposition hanging at the end.
    expect(good.length / endings.length).toBeGreaterThanOrEqual(0.6)
    const hanging = /\s(y|e|o|que|de|en|con|a|por|para|sin)$/i
    for (const cue of cues.slice(0, -1)) expect(cue.text.replace(/\n/g, ' '), cue.text).not.toMatch(hanging)
  })

  it('gives each id once, in order, and uses the times of the words without overlaps', () => {
    const words = spoken(TEXT)
    const cues = segment(plain(words), LONG, { ...OPTIONS, audioSeconds: words.at(-1)!.end + 2 })
    expect(new Set(cues.map((cue) => cue.id)).size).toBe(cues.length)
    expect(cues[0]!.start).toBe(words[0]!.start)
    cues.forEach((cue, i) => i > 0 && expect(cue.start).toBeGreaterThan(cues[i - 1]!.end))
  })

  it('marks the words heard with little confidence, and keeps what was heard of a corrected word', () => {
    const words: AlignedWord[] = plain(spoken('Hoy hacemos pan con masa madre.'))
    words[4] = { ...words[4]!, p: 0.3 }
    words[5] = { ...words[5]!, text: 'madre.', heard: 'madr.' }
    const [cue] = segment(words, LONG, { ...OPTIONS, audioSeconds: 10 })
    expect(cue!.flags.sort()).toEqual(['del_guion', 'poca_seguridad'])
    expect(cue!.heard).toBe('Hoy hacemos pan con masa madr.')
    expect(cue!.reviewed).toBe(false)
  })

  it('an empty audio gives no subtitles', () => {
    expect(segment([], LONG, { ...OPTIONS, audioSeconds: 10 })).toEqual([])
  })

  it('a word longer than a line breaks nothing: it goes alone', () => {
    const long = 'Electroencefalografistamente'.repeat(2)
    const words = plain(spoken(`Mira esto: ${long} y sigue.`))
    const cues = segment(words, SHORT, { ...OPTIONS, audioSeconds: 20 })
    expect(cues.map((cue) => cue.text)).toContain(long)
    expect(cues.map((cue) => cue.text).join(' ')).toBe(words.map((word) => word.text).join(' '))
  })

  it('fast speech still never overlaps nor leaves the audio', () => {
    const words = spoken(TEXT, { step: 0.12 })
    const audioSeconds = words.at(-1)!.end + 0.05
    const cues = segment(plain(words), LONG, { ...OPTIONS, audioSeconds })
    cues.forEach((cue, i) => {
      expect(cue.start).toBeLessThan(cue.end)
      expect(cue.end).toBeLessThanOrEqual(audioSeconds)
      if (i > 0) expect(cue.start).toBeGreaterThanOrEqual(cues[i - 1]!.end)
    })
  })
})

describe('splitting a subtitle into lines', () => {
  it('one line when it fits', () => {
    expect(splitLines('Hoy hacemos pan casero.'.split(' '), LONG)).toEqual(['Hoy hacemos pan casero.'])
  })

  it('two lines alike, never one word alone on a line', () => {
    const lines = splitLines('Primero mezclamos todo en un bol grande hasta que no quede harina seca'.split(' '), LONG)
    expect(lines).toHaveLength(2)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(42)
      expect(line.split(' ').length).toBeGreaterThan(1)
    }
    expect(Math.abs(lines[0]!.length - lines[1]!.length)).toBeLessThanOrEqual(16)
  })

  it('prefers to break after a comma', () => {
    const lines = splitLines(
      'Necesitas harina de fuerza, agua templada, sal fina y un poco de levadura'.split(' '),
      LONG,
    )
    expect(lines[0]!.endsWith(',')).toBe(true)
  })
})

describe('the edges found at the gate of US1', () => {
  it('cues squeezed at the very end of the audio never overlap', () => {
    // Words whose times were cut to the end of the audio (parse.ts), in cues of their own.
    const words: AlignedWord[] = plain([
      { text: 'Hola', start: 0.2, end: 0.6, p: 0.9 },
      ...Array.from({ length: 12 }, (_, i) => ({ text: `palabra${i}`, start: 3, end: 3, p: 0.9 })),
    ])
    const cues = segment(words, SHORT, { ...OPTIONS, audioSeconds: 3 })
    for (const [i, cue] of cues.entries()) {
      expect(cue.end).toBeGreaterThan(cue.start)
      expect(cue.end).toBeLessThanOrEqual(3)
      if (i > 0) expect(cue.start).toBeGreaterThanOrEqual(cues[i - 1]!.end)
    }
  })

  it('what was heard has no double spaces when one word took the place of two', () => {
    const words: AlignedWord[] = [
      { text: 'masa', start: 0.2, end: 0.5, p: 0.9, heard: 'masamadre' },
      { text: 'madre', start: 0.5, end: 0.8, p: 0.9, heard: '' },
      { text: 'casera', start: 0.8, end: 1.2, p: 0.9, heard: null },
    ]
    const [cue] = segment(words, LONG, { ...OPTIONS, audioSeconds: 2 })
    expect(cue?.heard).toBe('masamadre casera')
  })
})
