import { z } from 'zod'

// What the subtitles use of the reading limits, the thresholds and YouTube's formats
// (specs/007-subtitles/research.md R7, R8, R10 and R14).
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    version: z.number().int().positive(),
    reviewedAt: z.iso.date(),
    source: z.array(z.object({ label: z.string().min(1), url: z.url({ protocol: /^https$/ }) })).min(1),
    data,
  })

const index = z.number().int().nonnegative()
// A figure, with the source it comes from or marked as an assumption (principle V). Seconds have decimals.
const figure = z.union([
  z.object({ value: z.number().positive(), source: index }),
  z.object({ value: z.number().positive(), assumption: z.literal(true) }),
])

const limits = z.object({
  maxLines: figure,
  maxCharsPerLine: figure,
  maxCharsPerSecond: figure,
  minSeconds: figure,
  maxSeconds: figure,
  minGapSeconds: figure,
})

export const SUBTITLE_FORMATS = ['srt', 'vtt', 'sbv'] as const
export type SubtitleFormat = (typeof SUBTITLE_FORMATS)[number]

export const SUBTITLES_SCHEMAS = {
  'craft.json': envelope(
    z.object({
      long: limits,
      short: limits,
      // Below this mean probability a word is marked «no se oyó bien» (R10).
      lowConfidence: z.object({ value: z.number().gt(0).lt(1), assumption: z.literal(true) }),
      // Seconds of work per second of audio, by `<platform>-<arch>` and model, before this machine is measured (R7).
      speed: z.object({
        factors: z.record(
          z.string().regex(/^(darwin|linux)-(arm64|x64)$/),
          z.record(z.string().min(1), z.number().positive()),
        ),
        fallback: z.number().positive(),
        assumption: z.literal(true),
      }),
    }),
  ),
  'youtube.json': envelope(
    z.object({
      formats: z
        .array(z.object({ id: z.enum(SUBTITLE_FORMATS), extension: z.string().regex(/^\.[a-z]+$/), source: index }))
        .min(1),
      byDefault: z.enum(SUBTITLE_FORMATS),
    }),
  ),
} as const

export type SubtitlesFile = keyof typeof SUBTITLES_SCHEMAS
export const SUBTITLES_FILES = Object.keys(SUBTITLES_SCHEMAS) as SubtitlesFile[]
export type SubtitlesPackage<F extends SubtitlesFile> = z.infer<(typeof SUBTITLES_SCHEMAS)[F]>
export type SubtitleCraft = SubtitlesPackage<'craft.json'>['data']
export type SubtitleLimitsFigures = SubtitleCraft['long']

export interface SubtitlesKnowledge {
  craft: SubtitlesPackage<'craft.json'>
  youtube: SubtitlesPackage<'youtube.json'>
}

const bundled = import.meta.glob<unknown>('../subtitles/*.json', { eager: true, import: 'default' })

export function bundledSubtitlesFiles(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(bundled).map(([path, json]) => [path.slice(path.lastIndexOf('/') + 1), json]),
  )
}

/** Validates the packages; throws naming the broken file, so the server refuses to start (principle V). */
export function loadSubtitlesKnowledge(files: Record<string, unknown> = bundledSubtitlesFiles()): SubtitlesKnowledge {
  const read = <F extends SubtitlesFile>(file: F): SubtitlesPackage<F> => {
    if (!(file in files)) throw new Error(`Falta el fichero de conocimiento subtitles/${file}`)
    const parsed = SUBTITLES_SCHEMAS[file].safeParse(files[file])
    if (!parsed.success)
      throw new Error(`El fichero de conocimiento subtitles/${file} no es válido: ${z.prettifyError(parsed.error)}`)
    return parsed.data as SubtitlesPackage<F>
  }
  return { craft: read('craft.json'), youtube: read('youtube.json') }
}

/** The packages as Ajustes lists them, with their age (principle V). */
export function subtitlesKnowledgeFiles(subtitles: SubtitlesKnowledge) {
  return (['craft', 'youtube'] as const).map((key) => ({
    file: `subtitles/${key}.json`,
    label: subtitles[key].source[0]!.label,
    reviewedAt: subtitles[key].reviewedAt,
  }))
}
