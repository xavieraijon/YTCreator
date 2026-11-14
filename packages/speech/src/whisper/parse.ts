import type { HeardWord } from '@ytcreator/core'

interface Token {
  text?: unknown
  offsets?: { from?: unknown; to?: unknown }
  p?: unknown
}

const WORD_LIMIT = 100
const isSpecial = (text: string) => /^\[_.*\]$/.test(text) || /^<\|.*\|>$/.test(text)
const hasLetter = (text: string) => /[\p{L}\p{N}]/u.test(text)

/**
 * The words of whisper-cli's full JSON (`-ojf`). A word starts at a fragment that begins with a space; its times go from
 * its first fragment to its last, and its probability is the mean of theirs (R10). The file is read as bytes: a
 * fragment can hold half of a «ñ», so the bytes of a word are joined before they are read as UTF-8.
 */
export function parseWhisperJson(bytes: Buffer, audioSeconds: number): HeardWord[] {
  const data = JSON.parse(bytes.toString('latin1')) as { transcription?: { tokens?: Token[] }[] }
  const words: HeardWord[] = []
  let current: { bytes: Buffer[]; start: number; end: number; p: number[] } | null = null
  const close = () => {
    if (!current) return
    const text = Buffer.concat(current.bytes).toString('utf8').trim().slice(0, WORD_LIMIT)
    const p = current.p.reduce((sum, value) => sum + value, 0) / current.p.length
    // In whole milliseconds, never past the end of the audio (rounded down, so it stays inside).
    const last = Math.floor(audioSeconds * 1000) / 1000
    const start = Math.min(round(Math.max(0, current.start)), last)
    const end = Math.min(Math.max(start, round(current.end)), last)
    current = null
    if (!text) return
    const previous = words.at(-1)
    // Signs said on their own («-», «¿») go with the word before, as a subtitle shows them.
    if (!hasLetter(text) && previous) {
      previous.text = `${previous.text}${text}`.slice(0, WORD_LIMIT)
      return
    }
    words.push({ text, start, end, p: round(Math.min(1, Math.max(0, p))) })
  }
  for (const segment of data.transcription ?? []) {
    for (const token of segment.tokens ?? []) {
      if (typeof token.text !== 'string' || token.text === '' || isSpecial(token.text)) continue
      const from = Number(token.offsets?.from) / 1000
      const to = Number(token.offsets?.to) / 1000
      const p = Number(token.p)
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue
      const raw = Buffer.from(token.text, 'latin1')
      if (!current || raw[0] === 0x20) {
        close()
        current = { bytes: [], start: from, end: to, p: [] }
      }
      current.bytes.push(raw)
      current.end = Math.max(current.end, to)
      if (Number.isFinite(p)) current.p.push(p)
    }
  }
  close()
  return words
}

const round = (value: number) => Math.round(value * 1000) / 1000
