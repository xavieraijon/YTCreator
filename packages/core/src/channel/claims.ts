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
// «3,2 veces lo normal» is a figure of the reading however small: «2 veces por semana» is not. It can only come from
// the ratio of a video: any other number that happens to match proves nothing.
const WHAT_IS_NORMAL = String.raw`(?:(?:lo\s+)?(?:normal|habitual)|(?:la|tu|su)\s+media|(?:el|tu|su)\s+promedio)(?![\p{L}])`
const NUMBER_WORDS: Record<string, number> = {
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  doble: 2,
  triple: 3,
  cuádruple: 4,
}
const TIMES_NORMAL = new RegExp(
  String.raw`(?<![\p{L}\d.,])(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s*veces\s+` +
    String.raw`(?:(?:más|menos|por\s+encima|por\s+debajo)\s+(?:de\s+|del\s+|que\s+)?)?` +
    WHAT_IS_NORMAL,
  'giu',
)
const TIMES_IN_WORDS = new RegExp(
  String.raw`(?<![\p{L}])(doble|triple|cuádruple)\s+(?:de\s+|del\s+|que\s+)?` + WHAT_IS_NORMAL,
  'giu',
)
const RATIO_MARGIN = 0.05
// How long a video lasts is not a market figure: no amount or count can rest on it.
const NOT_A_FIGURE = new Set(['durationSeconds', 'averageDurationSeconds'])

interface Facts {
  numbers: number[]
  ratios: number[]
  videoIds: Set<string>
}

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

const timesValue = (raw: string): number => {
  const word = NUMBER_WORDS[raw.toLowerCase()]
  if (word !== undefined) return word
  return /^\d{1,3}(?:\.\d{3})+$/.test(raw) ? toNumber(raw) : Number(raw.replace(',', '.'))
}

export function parseTimesNormal(text: string): number[] {
  return [...text.matchAll(TIMES_NORMAL), ...text.matchAll(TIMES_IN_WORDS)].map(([, raw = '']) => timesValue(raw))
}

function collect(value: unknown, known: Facts): void {
  if (typeof value === 'number') known.numbers.push(value)
  else if (typeof value === 'string') known.numbers.push(...parseFigures(value))
  else if (Array.isArray(value)) for (const item of value) collect(item, known)
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'videoId' && typeof item === 'string') known.videoIds.add(item)
      if (NOT_A_FIGURE.has(key)) continue
      if (/ratio$/i.test(key)) {
        if (typeof item === 'number') known.ratios.push(item)
        continue
      }
      collect(item, known)
    }
  }
}

function backed(figure: number, known: number[]): boolean {
  return known.some((n) =>
    [n, n * 100].some((candidate) => Math.abs(figure - candidate) <= Math.max(0.5, Math.abs(candidate) * TOLERANCE)),
  )
}

const isRatio = (figure: number, ratios: number[]) =>
  ratios.some((ratio) => Math.abs(figure - ratio) <= Math.max(RATIO_MARGIN, ratio * TOLERANCE))

const unbacked = (sentence: string, known: Facts) =>
  parseFigures(sentence).some((f) => !backed(f, known.numbers)) ||
  parseTimesNormal(sentence).some((f) => !isRatio(f, known.ratios))

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0)
}

function facts(input: Record<string, unknown>): Facts {
  const known: Facts = { numbers: [], ratios: [], videoIds: new Set() }
  collect(input, known)
  return known
}

function citesUnknownVideo(value: unknown, known: Set<string>): value is { text: string; videoIds: string[] } {
  if (!value || typeof value !== 'object' || !('videoIds' in value)) return false
  const ids = (value as { videoIds: unknown }).videoIds
  return Array.isArray(ids) && ids.some((id) => typeof id !== 'string' || !known.has(id))
}

function walk(value: unknown, path: string, known: Facts, out: ClaimViolation[]): void {
  if (typeof value === 'string') {
    for (const sentence of sentences(value)) {
      if (unbacked(sentence, known)) {
        out.push({ path, text: sentence, reason: 'cifra_sin_respaldo' })
      }
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, path ? `${path}.${i}` : String(i), known, out))
  } else if (value && typeof value === 'object') {
    if (citesUnknownVideo(value, known.videoIds)) {
      const { text, what } = value as { text?: unknown; what?: unknown }
      out.push({ path, text: String(text ?? what ?? ''), reason: 'video_inexistente' })
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

const hasEmptyText = (value: unknown): boolean => {
  if (value === '') return true
  if (Array.isArray(value)) return value.some(hasEmptyText)
  return value !== null && typeof value === 'object' && Object.values(value).some(hasEmptyText)
}

// Lists the creator has to see something in: left empty, an empty text remains for the schema to reject (FR-014).
const MUST_KEEP_ONE = new Set(['assumptions'])

function trim(value: unknown, known: Facts): unknown {
  if (typeof value === 'string') {
    return sentences(value)
      .filter((s) => !unbacked(s, known))
      .join(' ')
  }
  if (Array.isArray(value)) {
    // An item of a list that loses a text goes away with it: the list may do without it, its fields may not.
    return value
      .filter((item) => !citesUnknownVideo(item, known.videoIds))
      .map((item) => trim(item, known))
      .filter((item) => !hasEmptyText(item))
  }
  if (value && typeof value === 'object') {
    if (citesUnknownVideo(value, known.videoIds)) {
      const ids = (value as { videoIds: unknown[] }).videoIds
      value = { ...value, videoIds: ids.filter((id) => typeof id === 'string' && known.videoIds.has(id)) }
    }
    return Object.fromEntries(
      Object.entries(value as object).map(([k, v]) => {
        if (k === 'videoIds') return [k, v]
        const trimmed = trim(v, known)
        const lostAll = Array.isArray(v) && v.length > 0 && Array.isArray(trimmed) && trimmed.length === 0
        return [k, lostAll && MUST_KEEP_ONE.has(k) ? [''] : trimmed]
      }),
    )
  }
  return value
}

// After the retry: drop what is still unbacked and say so (`claimsTrimmed`).
export function trimClaims<T>(output: T, input: Record<string, unknown>): { output: T; trimmed: boolean } {
  if (checkClaims(output, input).length === 0) return { output, trimmed: false }
  return { output: trim(output, facts(input)) as T, trimmed: true }
}
