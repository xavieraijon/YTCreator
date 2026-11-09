// How long a text takes to say, and how much the AI is expected to write for it (research.md R11).
export const wordCount = (text: string): number => {
  const trimmed = text.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

export const durationSeconds = (text: string, wordsPerMinute: number): number =>
  Math.round((wordCount(text) / wordsPerMinute) * 60)

// A Spanish word is about 1,6 tokens; the 1,3 leaves room for the JSON and the notes; each block costs its fields.
const TOKENS_PER_WORD = 1.6
const MARGIN = 1.3
const TOKENS_PER_BLOCK = 60

export function expectedOutputTokens(seconds: number, wordsPerMinute: number, blocks: number): number {
  const words = (seconds / 60) * wordsPerMinute
  return Math.ceil(Number((words * TOKENS_PER_WORD * MARGIN).toFixed(6))) + TOKENS_PER_BLOCK * blocks
}
