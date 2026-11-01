// Figure validator (research R8, SC-002): every market figure in the AI text must come from `input`, and every point
// of a channel reading must cite a video that is in `input`.
export type ClaimReason = 'cifra_sin_respaldo' | 'video_inexistente'
export interface ClaimViolation {
  path: string
  text: string
  reason: ClaimReason
}

const FIGURE =
  /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(mil|millones?|k)?\s*(?:de\s+)?(%|€|euros?|visitas|vistas|reproducciones|suscriptores|seguidores|vídeos|videos)(?![\p{L}])/giu
// Below this, a count of views, subscribers or videos is a plan ("2 vídeos a la semana"), not a market figure.
const MIN_COUNT = 100
const TOLERANCE = 0.05

function toNumber(raw: string): number {
  return Number(raw.replaceAll('.', '').replace(',', '.'))
}

export function parseFigures(text: string): number[] {
  const figures: number[] = []
  for (const [, raw = '', scale, unit = ''] of text.matchAll(FIGURE)) {
    let value = toNumber(raw)
    const s = scale?.toLowerCase()
    if (s === 'mil' || s === 'k') value *= 1_000
    else if (s?.startsWith('millon')) value *= 1_000_000
    const isCount = !/^(%|€|euros?)$/i.test(unit)
    if (isCount && value < MIN_COUNT) continue
    figures.push(value)
  }
  return figures
}

function collect(value: unknown, numbers: number[], videoIds: Set<string>): void {
  if (typeof value === 'number') numbers.push(value)
  else if (typeof value === 'string') numbers.push(...parseFigures(value))
  else if (Array.isArray(value)) for (const item of value) collect(item, numbers, videoIds)
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'videoId' && typeof item === 'string') videoIds.add(item)
      collect(item, numbers, videoIds)
    }
  }
}

function backed(figure: number, known: number[]): boolean {
  return known.some((n) =>
    [n, n * 100].some((candidate) => Math.abs(figure - candidate) <= Math.max(0.5, Math.abs(candidate) * TOLERANCE)),
  )
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0)
}

interface Facts {
  numbers: number[]
  videoIds: Set<string>
}

function facts(input: Record<string, unknown>): Facts {
  const numbers: number[] = []
  const videoIds = new Set<string>()
  collect(input, numbers, videoIds)
  return { numbers, videoIds }
}

function citesUnknownVideo(value: unknown, known: Set<string>): value is { text: string; videoIds: string[] } {
  if (!value || typeof value !== 'object' || !('videoIds' in value)) return false
  const ids = (value as { videoIds: unknown }).videoIds
  return Array.isArray(ids) && ids.some((id) => typeof id !== 'string' || !known.has(id))
}

function walk(value: unknown, path: string, known: Facts, out: ClaimViolation[]): void {
  if (typeof value === 'string') {
    for (const sentence of sentences(value)) {
      if (parseFigures(sentence).some((f) => !backed(f, known.numbers))) {
        out.push({ path, text: sentence, reason: 'cifra_sin_respaldo' })
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, path ? `${path}.${i}` : String(i), known, out))
  } else if (value && typeof value === 'object') {
    if (citesUnknownVideo(value, known.videoIds)) {
      out.push({ path, text: String((value as { text?: unknown }).text ?? ''), reason: 'video_inexistente' })
      return
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'videoIds') continue
      walk(item, path ? `${path}.${key}` : key, known, out)
    }
  }
}

export function checkClaims(output: unknown, input: Record<string, unknown>): ClaimViolation[] {
  const out: ClaimViolation[] = []
  walk(output, '', facts(input), out)
  return out
}

// The text added to the prompt of the single retry.
export function claimsFeedback(violations: ClaimViolation[]): string {
  const lines = violations.map((v) =>
    v.reason === 'cifra_sin_respaldo'
      ? `- «${v.text}»: tiene una cifra que no está en los datos.`
      : `- «${v.text}»: cita un vídeo que no está en los datos.`,
  )
  return `Tu respuesta anterior tenía afirmaciones sin respaldo. Usa solo cifras y vídeos de <datos>:\n${lines.join('\n')}`
}

function trim(value: unknown, known: Facts): unknown {
  if (typeof value === 'string') {
    return sentences(value)
      .filter((s) => parseFigures(s).every((f) => backed(f, known.numbers)))
      .join(' ')
  }
  if (Array.isArray(value)) {
    return value.filter((item) => !citesUnknownVideo(item, known.videoIds)).map((item) => trim(item, known))
  }
  if (value && typeof value === 'object') {
    if (citesUnknownVideo(value, known.videoIds)) {
      const ids = (value as { videoIds: unknown[] }).videoIds
      value = { ...value, videoIds: ids.filter((id) => typeof id === 'string' && known.videoIds.has(id)) }
    }
    return Object.fromEntries(
      Object.entries(value as object).map(([k, v]) => [k, k === 'videoIds' ? v : trim(v, known)]),
    )
  }
  return value
}

// After the retry: drop what is still unbacked and say so (`claimsTrimmed`).
export function trimClaims<T>(output: T, input: Record<string, unknown>): { output: T; trimmed: boolean } {
  if (checkClaims(output, input).length === 0) return { output, trimmed: false }
  return { output: trim(output, facts(input)) as T, trimmed: true }
}
