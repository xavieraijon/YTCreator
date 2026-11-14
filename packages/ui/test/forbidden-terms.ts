/** Words the creator should never read in the interface (principle I, research R10). */
export const forbiddenTerms: readonly string[] = [
  'token',
  'tokens',
  'JSON',
  'API',
  'HTTP',
  'HTTPS',
  'URL',
  'prompt',
  'localStorage',
  'CSS',
  'HTML',
  'backend',
  'frontend',
  'endpoint',
  'null',
  'undefined',
  'LLM',
  'Claude',
  'Anthropic',
  'GPT',
  'ChatGPT',
  'OpenAI',
  'Gemini',
  'Ollama',
  'Llama',
  'Mistral',
  // Named in plain words on screen (003, contracts/ui-screens.md).
  'RPM',
  'YPP',
  'CTR',
  'handle',
  'yt-dlp',
  // The words of the measure that only the code uses (004, contracts/ui-screens.md).
  'clon',
  'tema amplio',
  // «Idea de miniatura» and «Indicaciones para la miniatura» instead (006, decision 12).
  'brief',
]

export interface StringEntry {
  readonly key: string
  readonly value: string
}

/** Every leaf of a nested strings object, with its dotted key. */
export function flattenStrings(strings: object, parent = ''): StringEntry[] {
  return Object.entries(strings).flatMap(([name, value]: [string, unknown]) => {
    const key = parent ? `${parent}.${name}` : name
    if (typeof value === 'string') return [{ key, value }]
    return value && typeof value === 'object' ? flattenStrings(value, key) : []
  })
}

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whole word, case-insensitive. Returns the key and the term of each match. */
export function findForbiddenTerms(
  strings: object,
  terms: readonly string[] = forbiddenTerms,
): { key: string; term: string }[] {
  return flattenStrings(strings).flatMap(({ key, value }) =>
    terms
      .filter((term) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'iu').test(value))
      .map((term) => ({ key, term })),
  )
}
