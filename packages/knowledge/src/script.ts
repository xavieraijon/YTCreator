import { z } from 'zod'

// What the script uses of the craft, the free review and what counts as a reliable source (research.md R13).
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    version: z.number().int().positive(),
    reviewedAt: z.iso.date(),
    source: z.array(z.object({ label: z.string().min(1), url: z.url({ protocol: /^https$/ }) })).min(1),
    data,
  })

const assumption = z.object({ label: z.string().min(1), assumption: z.literal(true), date: z.iso.date() })
const words = z.array(z.string().min(1)).min(1)
// A piece of advice: with the source it comes from, or marked as an assumption (principle V).
const advice = z.union([
  z.object({ text: z.string().min(1), source: z.number().int().nonnegative() }),
  z.object({ text: z.string().min(1), assumption: z.literal(true) }),
])

export const SCRIPT_SCHEMAS = {
  'craft.json': envelope(
    z.object({
      longVideo: z.object({
        structure: z.array(advice).min(1),
        hook: z.array(advice).min(1),
        retention: z.array(advice).min(1),
      }),
      short: z.array(advice).min(1),
    }),
  ),
  'review.json': envelope(
    z.object({
      basis: assumption,
      maxSentenceWords: z.number().int().positive(),
      hookMaxSeconds: z.object({ largo: z.number().int().positive(), short: z.number().int().positive() }),
      durationTolerance: z.number().gt(0).lt(1),
      fillers: words,
    }),
  ),
  'sources.json': envelope(
    z.object({
      twoSourcesRule: assumption,
      listsBasis: assumption,
      reliable: words,
      notReliable: words,
      unreliableDomains: words,
    }),
  ),
} as const

export type ScriptFile = keyof typeof SCRIPT_SCHEMAS
export const SCRIPT_FILES = Object.keys(SCRIPT_SCHEMAS) as ScriptFile[]
export type ScriptPackage<F extends ScriptFile> = z.infer<(typeof SCRIPT_SCHEMAS)[F]>
export type ReviewRules = ScriptPackage<'review.json'>['data']

export interface ScriptKnowledge {
  craft: ScriptPackage<'craft.json'>
  review: ScriptPackage<'review.json'>
  sources: ScriptPackage<'sources.json'>
}

const bundled = import.meta.glob<unknown>('../script/*.json', { eager: true, import: 'default' })

export function bundledScriptFiles(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(bundled).map(([path, json]) => [path.slice(path.lastIndexOf('/') + 1), json]),
  )
}

/** Validates the packages; throws naming the broken file, so the server refuses to start (principle V). */
export function loadScriptKnowledge(files: Record<string, unknown> = bundledScriptFiles()): ScriptKnowledge {
  const read = <F extends ScriptFile>(file: F): ScriptPackage<F> => {
    if (!(file in files)) throw new Error(`Falta el fichero de conocimiento ${file}`)
    const parsed = SCRIPT_SCHEMAS[file].safeParse(files[file])
    if (!parsed.success)
      throw new Error(`El fichero de conocimiento ${file} no es válido: ${z.prettifyError(parsed.error)}`)
    return parsed.data as ScriptPackage<F>
  }
  return { craft: read('craft.json'), review: read('review.json'), sources: read('sources.json') }
}

/** The packages as Ajustes lists them, with their age (principle V). */
export function scriptKnowledgeFiles(script: ScriptKnowledge) {
  return (['craft', 'review', 'sources'] as const).map((key) => ({
    file: `${key}.json`,
    label: script[key].source[0]!.label,
    reviewedAt: script[key].reviewedAt,
  }))
}
