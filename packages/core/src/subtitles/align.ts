import type { HeardWord } from './model.ts'
import type { AlignedWord } from './segment.ts'

// The heard words corrected with the approved script (research.md R9, SC-004): only short changes between alike
// words. What was improvised and what the script has but was not said are never touched.

const MAX_RUN = 3
// Strictly under half the letters (decision 19): at exactly half, «nevera» and «encimera» were taken as the same word.
const ALIKE = 0.5
// Short words (la, lo, el) are too easy to confuse: they are only changed when they are the same number.
const MIN_ALIKE_LENGTH = 4
const BAND = 150

const UNITS: Record<string, number> = {
  cero: 0,
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
}
const TENS: Record<string, number> = {
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
}
const HUNDREDS: Record<string, number> = {
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
}
// Alone, «un» and «una» are articles far more often than numbers.
const NOT_ALONE = new Set(['un', 'una'])

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** The word without the signs around it: «¡Hola,» → «Hola». */
const core = (text: string) => text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const lead = (text: string) => /^[^\p{L}\p{N}]*/u.exec(text)![0]
const trail = (text: string) => /[^\p{L}\p{N}]*$/u.exec(text)![0]

/** A number written with words («doscientos cincuenta» → 250); null if any word is not part of one. */
export function spanishNumber(tokens: readonly string[]): number | null {
  const words = tokens.map((token) => fold(core(token))).filter((word) => word !== '')
  if (words.length === 0) return null
  let total = 0
  let current = 0
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    if (word === 'y') {
      // Only between the tens and the units: «treinta y cinco».
      const before = words[i - 1]
      const after = words[i + 1]
      if (!before || !(before in TENS) || !after || !(after in UNITS) || UNITS[after]! > 9) return null
      continue
    }
    if (word === 'mil') {
      total += (current || 1) * 1000
      current = 0
    } else if (word === 'millon' || word === 'millones') {
      total = (total + (current || 1)) * 1_000_000
      current = 0
    } else if (word in UNITS) current += UNITS[word]!
    else if (word in TENS) current += TENS[word]!
    else if (word in HUNDREDS) current += HUNDREDS[word]!
    else return null
  }
  return total + current
}

const digitsOf = (text: string): number | null => {
  const plain = core(text).replace(/(\d)\.(?=\d{3}\b)/g, '$1')
  return /^\d+$/.test(plain) ? Number(plain) : null
}

/** How a word is compared: lowercase, without accents or signs, a number as its digits. */
export function normalizeWord(text: string): string {
  const digits = digitsOf(text)
  if (digits !== null) return String(digits)
  const word = fold(core(text))
  if (!NOT_ALONE.has(word)) {
    const number = spanishNumber([word])
    if (number !== null) return String(number)
  }
  return word
}

const numberOf = (texts: readonly string[]): number | null =>
  texts.length === 1 && digitsOf(texts[0]!) !== null ? digitsOf(texts[0]!) : spanishNumber(texts)

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    previous = current
  }
  return previous[b.length]!
}

/** Whether a few heard words and a few of the script are the same thing heard badly. */
function alike(heardTexts: readonly string[], scriptTexts: readonly string[]): boolean {
  const heardNumber = numberOf(heardTexts)
  const scriptNumber = numberOf(scriptTexts)
  if (heardNumber !== null || scriptNumber !== null) return heardNumber === scriptNumber
  const a = heardTexts.map((text) => fold(core(text))).join('')
  const b = scriptTexts.map((text) => fold(core(text))).join('')
  const longest = Math.max(a.length, b.length)
  return longest >= MIN_ALIKE_LENGTH && editDistance(a, b) / longest < ALIKE
}

/** The script's form of a word, with the signs and the capital letter of what was heard. */
function written(heardText: string, scriptText: string, first: boolean, last: boolean): string {
  let word = core(scriptText)
  const heardCore = core(heardText)
  if (heardCore && heardCore[0] !== heardCore[0]!.toLowerCase() && word) word = word[0]!.toUpperCase() + word.slice(1)
  return `${first ? lead(heardText) : ''}${word}${last ? trail(heardText) : ''}`
}

const DIAGONAL = 0
const HEARD_ONLY = 1
const SCRIPT_ONLY = 2

export function align(heard: readonly HeardWord[], scriptText: string): AlignedWord[] {
  const script = scriptText.split(/\s+/).filter((token) => token !== '')
  const keep = (word: HeardWord): AlignedWord => ({ ...word, heard: null })
  if (heard.length === 0 || script.length === 0) return heard.map(keep)

  const n = heard.length
  const m = script.length
  const h = heard.map((word) => normalizeWord(word.text))
  const s = script.map(normalizeWord)

  // Global alignment in a band around the diagonal (R9): wide enough for what was improvised or left out.
  const width = BAND + Math.abs(n - m)
  const lo = (i: number) => Math.max(0, Math.round((i * m) / n) - width)
  const hi = (i: number) => Math.min(m, Math.round((i * m) / n) + width)
  const rowStart = new Int32Array(n + 2)
  for (let i = 0; i <= n; i++) rowStart[i + 1] = rowStart[i]! + (hi(i) - lo(i) + 1)
  const steps = new Uint8Array(rowStart[n + 1]!)
  const INF = 1 << 29
  let previous = new Int32Array(0)
  let previousLo = 0
  let previousHi = -1
  const at = (row: Int32Array, rowLo: number, rowHi: number, j: number) =>
    j < rowLo || j > rowHi ? INF : row[j - rowLo]!
  for (let i = 0; i <= n; i++) {
    const rowLo = lo(i)
    const rowHi = hi(i)
    const current = new Int32Array(rowHi - rowLo + 1)
    for (let j = rowLo; j <= rowHi; j++) {
      let best = INF
      let step = DIAGONAL
      if (i === 0 && j === 0) best = 0
      if (i > 0 && j > 0) {
        const diagonal = at(previous, previousLo, previousHi, j - 1) + (h[i - 1] === s[j - 1] ? 0 : 2)
        if (diagonal < best) best = diagonal
      }
      if (i > 0) {
        const up = at(previous, previousLo, previousHi, j) + 2
        if (up < best) {
          best = up
          step = HEARD_ONLY
        }
      }
      if (j > rowLo || (j > 0 && j - 1 >= rowLo)) {
        const left = j > 0 ? at(current, rowLo, rowHi, j - 1) + 2 : INF
        if (left < best) {
          best = left
          step = SCRIPT_ONLY
        }
      }
      current[j - rowLo] = best
      steps[rowStart[i]! + j - rowLo] = step
    }
    previous = current
    previousLo = rowLo
    previousHi = rowHi
  }

  // Back from the end: the pairs in order.
  const ops: { i: number | null; j: number | null }[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const step = i === 0 ? SCRIPT_ONLY : j === 0 ? HEARD_ONLY : steps[rowStart[i]! + j - lo(i)]!
    if (step === DIAGONAL) ops.push({ i: --i, j: --j })
    else if (step === HEARD_ONLY) ops.push({ i: --i, j: null })
    else ops.push({ i: null, j: --j })
  }
  ops.reverse()

  const result: AlignedWord[] = []
  let runHeard: number[] = []
  let runScript: number[] = []
  const flush = () => {
    const words = runHeard.map((index) => heard[index]!)
    const scriptTexts = runScript.map((index) => script[index]!)
    if (
      words.length >= 1 &&
      words.length <= MAX_RUN &&
      scriptTexts.length >= 1 &&
      scriptTexts.length <= MAX_RUN &&
      alike(
        words.map((word) => word.text),
        scriptTexts,
      )
    ) {
      result.push(...replace(words, scriptTexts))
    } else result.push(...words.map(keep))
    runHeard = []
    runScript = []
  }
  for (const op of ops) {
    if (op.i !== null && op.j !== null && h[op.i] === s[op.j]) {
      flush()
      const word = heard[op.i]!
      const scriptWord = script[op.j]!
      // Same word, written another way («veinte» and «20», a missing accent): the script's way.
      const same = core(word.text).toLowerCase() === core(scriptWord).toLowerCase()
      result.push(same ? keep(word) : { ...word, text: written(word.text, scriptWord, true, true), heard: word.text })
      continue
    }
    if (op.i !== null) runHeard.push(op.i)
    if (op.j !== null) runScript.push(op.j)
  }
  flush()
  return result
}

/** The script's words in place of the heard ones, sharing their time; the first one keeps all that was heard. */
function replace(words: readonly HeardWord[], scriptTexts: readonly string[]): AlignedWord[] {
  if (words.length === scriptTexts.length)
    return words.map((word, k) => ({
      ...word,
      text: written(word.text, scriptTexts[k]!, true, true),
      heard: word.text,
    }))
  const start = words[0]!.start
  const end = words.at(-1)!.end
  const p = Math.min(...words.map((word) => word.p))
  const heardText = words.map((word) => word.text).join(' ')
  const total = scriptTexts.reduce((sum, text) => sum + text.length, 0)
  let at = start
  return scriptTexts.map((text, k) => {
    const share = ((end - start) * text.length) / total
    const word: AlignedWord = {
      text:
        written(k === 0 ? words[0]!.text : '', text, k === 0, false) +
        (k === scriptTexts.length - 1 ? trail(words.at(-1)!.text) : ''),
      start: Math.round(at * 1000) / 1000,
      end: Math.round((k === scriptTexts.length - 1 ? end : at + share) * 1000) / 1000,
      p,
      // The other words of the change have nothing of their own heard: it all goes with the first.
      heard: k === 0 ? heardText : '',
    }
    at += share
    return word
  })
}
