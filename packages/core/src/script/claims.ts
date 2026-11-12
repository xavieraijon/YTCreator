import type { Claim, Fact, ScriptClaimReason } from './model.ts'
import { SCRIPT_LIMITS } from './model.ts'

// What the script states without backing gets marked «por comprobar» (research.md R9). It only looks at what the AI
// wrote: what the creator writes by hand is theirs.
const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre'
const NUMBER = String.raw`\d+(?:[.,]\d+)*`
const WORD_NUMBER =
  'un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|cientos'
const END = String.raw`(?![\p{L}\p{N}])`
const START = String.raw`(?<![\p{L}\p{N}])`

// In order: a longer kind wins over what it contains.
const FIGURES = [
  String.raw`\d{1,2} de (?:${MONTHS})(?: de \d{4})?`,
  String.raw`(?:${MONTHS}) de \d{4}`,
  String.raw`\d{1,2}/\d{1,2}(?:/\d{2,4})?`,
  String.raw`${NUMBER}\s?(?:%|por ciento)`,
  String.raw`(?:(?:${NUMBER}|${WORD_NUMBER})\s+)?(?:mil(?:\s+millones)?|mill[oó]n|millones|bill[oó]n|billones)`,
  NUMBER,
].map((source) => new RegExp(`${START}(?:${source})${source === NUMBER ? String.raw`(?!\p{N})` : END}`, 'giu'))

// Runs of capitalised words, which may be joined by «de», «del» and the like.
const NAME = /\p{Lu}[\p{L}\p{M}'’-]+(?:\s+(?:(?:de|del|la|las|los)\s+)?\p{Lu}[\p{L}\p{M}'’-]+)*/gu
const SENTENCE_END = /(?:^|[.!?…\n]["»”)]?\s*)[¿¡"«“(]*$/u

const normalise = (text: string) =>
  text
    .normalize('NFC')
    .toLocaleLowerCase('es')
    .replace(/(\d)[.\s](?=\d{3}(?!\d))/g, '$1')
    .replace(/\s*por ciento/g, '%')
    .replace(/\s+%/g, '%')
    .replace(/\s+/g, ' ')
    .trim()

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Whole words only: «250» is not in «2500».
const mentions = (haystack: string, fragment: string) =>
  new RegExp(`${START}${escape(normalise(fragment))}${END}`, 'u').test(haystack)

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char)

/**
 * Where a fragment stands on its own in a text. «mil» is not in «familia», and «5» is not in «15» nor in «1,5».
 */
export function occurrences(text: string, fragment: string): [number, number][] {
  const found: [number, number][] = []
  if (fragment === '') return found
  const startsWord = isWordChar(fragment[0])
  const endsWord = isWordChar(fragment.at(-1))
  const digitBefore = /\d[.,]$/u
  const digitAfter = /^[.,]\d/u
  let start = text.indexOf(fragment)
  while (start !== -1) {
    const end = start + fragment.length
    const freeBefore = !startsWord || (!isWordChar(text[start - 1]) && !digitBefore.test(text.slice(0, start)))
    const freeAfter = !endsWord || (!isWordChar(text[end]) && !digitAfter.test(text.slice(end)))
    if (freeBefore && freeAfter) found.push([start, end])
    start = text.indexOf(fragment, start + 1)
  }
  return found
}

export const hasFragment = (text: string, fragment: string) => occurrences(text, fragment).length > 0

export function replaceFragment(text: string, fragment: string, by: string): string {
  let result = ''
  let at = 0
  for (const [start, end] of occurrences(text, fragment)) {
    result += text.slice(at, start) + by
    at = end
  }
  return result + text.slice(at)
}

/** Takes the fragment out, and only that (FR-012): the creator rereads the sentence. */
export const withoutFragment = (text: string, fragment: string) =>
  replaceFragment(text, fragment, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,;:!?…])/g, '$1')
    .trim()

function figuresIn(text: string): string[] {
  const taken: [number, number][] = []
  const found: { start: number; text: string }[] = []
  for (const figure of FIGURES) {
    for (const match of text.matchAll(figure)) {
      const start = match.index
      const end = start + match[0].length
      if (taken.some(([from, to]) => start < to && end > from)) continue
      taken.push([start, end])
      found.push({ start, text: match[0] })
    }
  }
  return found.sort((a, b) => a.start - b.start).map((one) => one.text)
}

function namesIn(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(NAME)) {
    let name = match[0]
    if (SENTENCE_END.test(text.slice(0, match.index))) {
      // The first word is capitalised because of where it is; what follows it is not.
      const rest = name.replace(/^\S+\s+(?:(?:de|del|la|las|los)\s+)?/u, '')
      if (rest === name) continue
      name = rest
    }
    found.push(name)
  }
  return found
}

interface DetectInput {
  readonly blocks: readonly { readonly id: string; readonly text: string }[]
  /** The notes and the idea, and anything else that counts as said by the creator. */
  readonly known: readonly string[]
  readonly facts: readonly Fact[]
  readonly aiClaims: readonly { readonly blockId: string; readonly text: string; readonly factId: string | null }[]
  readonly newId: () => string
}

const isDoubtful = (fact: Fact) => fact.label === 'una_fuente' || fact.label === 'sin_confirmar'

export function detectClaims({ blocks, known, facts, aiClaims, newId }: DetectInput): Claim[] {
  const backed = normalise([...known, ...facts.filter((fact) => !isDoubtful(fact)).map((fact) => fact.text)].join('\n'))
  const doubtful = facts.filter(isDoubtful).map((fact) => ({ fact, text: normalise(fact.text) }))
  const claims: Claim[] = []

  for (const block of blocks) {
    const inBlock: { text: string; factId: string | null; reason: ScriptClaimReason }[] = []
    const fromFact = (text: string) => doubtful.find((one) => mentions(one.text, text))?.fact.id ?? null

    for (const claim of aiClaims) {
      if (claim.blockId !== block.id || !hasFragment(block.text, claim.text)) continue
      const named = claim.factId ? facts.find((fact) => fact.id === claim.factId) : undefined
      if (named && !isDoubtful(named)) continue
      // The prompt lists every figure, and a note is not a fact: what the creator wrote is not marked.
      if (!named && mentions(backed, claim.text)) continue
      const factId = named?.id ?? fromFact(claim.text)
      inBlock.push({ text: claim.text, factId, reason: factId ? 'hecho_dudoso' : 'sin_respaldo' })
    }
    for (const text of [...figuresIn(block.text), ...namesIn(block.text)]) {
      if (mentions(backed, text)) continue
      const factId = fromFact(text)
      inBlock.push({ text, factId, reason: factId ? 'hecho_dudoso' : 'sin_respaldo' })
    }

    // The longest says the most: what only appears inside it, or is repeated, adds nothing.
    const kept: typeof inBlock = []
    for (const one of inBlock.sort((a, b) => b.text.length - a.text.length)) {
      if (one.text.length > SCRIPT_LIMITS.claimText) continue
      const covered = kept.flatMap((longer) => occurrences(block.text, longer.text))
      const places = occurrences(block.text, one.text)
      if (!places.every(([start, end]) => covered.some(([from, to]) => start >= from && end <= to))) kept.push(one)
    }
    const position = (text: string) => block.text.indexOf(text)
    for (const one of kept.sort((a, b) => position(a.text) - position(b.text))) {
      claims.push({ id: newId(), blockId: block.id, status: 'pendiente', check: null, ...one })
    }
  }
  return claims
}

const LIVE: readonly Claim['status'][] = ['pendiente', 'confirmada', 'corregida']

/** A mark whose words were edited away is gone (research.md R10). */
export function settleOrphans(claims: readonly Claim[], blocks: readonly { id: string; text: string }[]): Claim[] {
  return claims.map((claim) => {
    const block = blocks.find((one) => one.id === claim.blockId)
    return LIVE.includes(claim.status) && !(block && hasFragment(block.text, claim.text))
      ? { ...claim, status: 'quitada' }
      : claim
  })
}

export interface MarkedPart {
  readonly text: string
  readonly claimId?: string
}

/** The text of a block, cut around what still has to be checked. */
export function splitMarks(text: string, claims: readonly Claim[]): MarkedPart[] {
  const ranges: { start: number; end: number; claimId: string }[] = []
  const longestFirst = claims
    .filter((claim) => claim.status === 'pendiente' && claim.text !== '')
    .sort((a, b) => b.text.length - a.text.length)
  for (const claim of longestFirst) {
    for (const [start, end] of occurrences(text, claim.text)) {
      if (!ranges.some((range) => start < range.end && end > range.start))
        ranges.push({ start, end, claimId: claim.id })
    }
  }
  const parts: MarkedPart[] = []
  let at = 0
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    if (range.start > at) parts.push({ text: text.slice(at, range.start) })
    parts.push({ text: text.slice(range.start, range.end), claimId: range.claimId })
    at = range.end
  }
  if (at < text.length || parts.length === 0) parts.push({ text: text.slice(at) })
  return parts
}

// What «Comprobar con internet» still has to search: a pending mark never searched, or one whose search was cut short
// (a link that could not be tried, nothing that opens). A mark already answered is not paid for again (decision 49).
export function needsSearch(claim: Pick<Claim, 'status' | 'check'>): boolean {
  if (claim.status !== 'pendiente') return false
  if (claim.check === null) return true
  const links = claim.check.sources.map((source) => source.link)
  return !links.includes('abre') && links.includes('sin_comprobar')
}
