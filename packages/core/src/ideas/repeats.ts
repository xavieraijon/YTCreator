import { normalizeName } from '../market/names.ts'

// The ideas the AI must not repeat (research R9): what is in the bank, archived or discarded. A candidate repeats one
// when its title or its search is the same once normalized (accents, case and punctuation aside).
export interface Known {
  title: string
  query?: string | null
}

export function dropRepeats<T extends Known>(
  candidates: readonly T[],
  existing: readonly Known[],
): { kept: T[]; removed: number } {
  const titles = new Set<string>()
  const queries = new Set<string>()
  const remember = (idea: Known) => {
    titles.add(normalizeName(idea.title))
    if (idea.query) queries.add(normalizeName(idea.query))
  }
  existing.forEach(remember)
  const kept: T[] = []
  for (const candidate of candidates) {
    const repeated =
      titles.has(normalizeName(candidate.title)) || (!!candidate.query && queries.has(normalizeName(candidate.query)))
    // Two candidates of the same batch that repeat each other count too: only the first stays.
    if (!repeated) kept.push(candidate)
    remember(candidate)
  }
  return { kept, removed: candidates.length - kept.length }
}

// The idea of the bank with the same title, if any (R15: «Ya tienes una idea igual»).
export function duplicateOf<T extends Known & { id: string }>(title: string, ideas: readonly T[]): string | null {
  const wanted = normalizeName(title)
  return ideas.find((idea) => normalizeName(idea.title) === wanted)?.id ?? null
}
