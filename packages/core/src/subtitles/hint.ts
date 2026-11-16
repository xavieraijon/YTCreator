// What the engine is told before it listens (research.md R6): the proper names, figures and terms of the approved
// script, so that it already writes them as the script does. Whisper reads up to about 224 tokens of it; 600
// characters of names and figures stay under 200 (decision 22).

const MAX_CHARS = 600
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu
const SENTENCE_START = /(^|[.!?¿¡…:]\s*|\n\s*)$/u

export function scriptHint(script: string): string {
  const text = script.replace(/^#+\s*/gm, '').replace(/[*_`>]/g, '')
  const found: string[] = []
  const seen = new Set<string>()
  let length = 0
  const add = (term: string) => {
    const key = term.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push(term)
    length += term.length + 2
  }
  for (const match of text.matchAll(WORD)) {
    const word = match[0]
    // Enough terms for the hint: the rest of the script is not read.
    if (length >= MAX_CHARS) break
    // Only the few characters before the word say whether a sentence starts there (linear, not the whole text).
    const before = text.slice(Math.max(0, match.index - 16), match.index)
    const afterStart = !(match.index <= 16 && /^\s*$/u.test(before)) && !SENTENCE_START.test(before)
    // A figure goes with the word after it («20 minutos»), as it is said.
    if (/^\d/.test(word)) {
      const next = /^\s+([\p{L}]+)/u.exec(text.slice(match.index + word.length))
      add(next ? `${word} ${next[1]}` : word)
      continue
    }
    const mixed = /\d/.test(word) || /^\p{Ll}+\p{Lu}/u.test(word) || /^\p{Lu}{2,}$/u.test(word)
    const name = /^\p{Lu}/u.test(word) && afterStart
    if (mixed || name) add(word)
  }
  let hint = ''
  for (const term of found) {
    const next = hint ? `${hint}, ${term}` : term
    if (next.length > MAX_CHARS) break
    hint = next
  }
  return hint
}
