import { normalizeName } from '../market/names.ts'

// Words that say nothing about the topic, in Spanish and English (research R1). Written without accents, as
// `normalizeName` leaves them.
const STOPWORDS = new Set([
  // Spanish
  'a',
  'al',
  'ante',
  'con',
  'como',
  'de',
  'del',
  'desde',
  'el',
  'en',
  'entre',
  'es',
  'esta',
  'este',
  'esto',
  'hacia',
  'hasta',
  'la',
  'las',
  'lo',
  'los',
  'mas',
  'me',
  'mi',
  'mis',
  'muy',
  'o',
  'para',
  'pero',
  'por',
  'que',
  'se',
  'si',
  'sin',
  'sobre',
  'su',
  'sus',
  'te',
  'tu',
  'tus',
  'un',
  'una',
  'unas',
  'uno',
  'unos',
  'y',
  'ya',
  // English
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'its',
  'my',
  'of',
  'on',
  'or',
  'the',
  'this',
  'to',
  'what',
  'with',
  'you',
  'your',
])

// The key words of a search: normalized, without the empty ones, each once.
export function keywordsOf(query: string): string[] {
  const words = normalizeName(query)
    .split(' ')
    .filter((word) => word !== '' && !STOPWORDS.has(word))
  return [...new Set(words)]
}

// A video is «casi igual» if its title has most of the key words: the share rounded up, at least two; with only one
// key word, that one is enough (R1). The share is an assumption of thresholds.json.
export function isSimilar(title: string, keywords: readonly string[], share = 0.75): boolean {
  if (keywords.length === 0) return false
  const words = new Set(normalizeName(title).split(' '))
  const found = keywords.filter((keyword) => words.has(keyword)).length
  const needed = keywords.length === 1 ? 1 : Math.max(2, Math.ceil(keywords.length * share))
  return found >= needed
}
