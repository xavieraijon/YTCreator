// The instructions, then the data in a block of its own: what the creator types never reads as an instruction.
// `</` is escaped (still valid JSON), so no value can close the block early.
export function buildPrompt(text: string, input?: Record<string, unknown>): string {
  if (!input) return text
  const json = JSON.stringify(input, null, 2).replaceAll('</', '<\\/')
  return `${text}\n\n<datos>\n${json}\n</datos>\n`
}
