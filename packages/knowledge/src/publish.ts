import { z } from 'zod'

// What the publishing package uses of YouTube's rules, the craft and the guided list of YouTube Studio
// (specs/006-publishing-package/research.md R11, R12).
const envelope = <T extends z.ZodType>(data: T) =>
  z.object({
    version: z.number().int().positive(),
    reviewedAt: z.iso.date(),
    source: z.array(z.object({ label: z.string().min(1), url: z.url({ protocol: /^https$/ }) })).min(1),
    data,
  })

const index = z.number().int().nonnegative()
// A figure: with the source it comes from, or marked as an assumption (principle V).
const figure = z.union([
  z.object({ value: z.number().int().positive(), source: index }),
  z.object({ value: z.number().int().positive(), assumption: z.literal(true) }),
])
const advice = z.union([
  z.object({ text: z.string().min(1), source: index }),
  z.object({ text: z.string().min(1), assumption: z.literal(true) }),
])
const advices = z.array(advice).min(1)
const text = z.string().min(1)

const basis = z.union([z.object({ source: index }), z.object({ assumption: z.literal(true) })])

export const PUBLISH_SCHEMAS = {
  'youtube.json': envelope(
    z.object({
      titleMaxChars: figure,
      descriptionMaxChars: figure,
      tagsMaxTotalChars: figure,
      chapters: z.object({ minCount: figure, minSeconds: figure, firstAtZero: z.object({ source: index }) }),
      hashtags: z.object({ shownAboveTitle: figure, ignoredAbove: figure }),
      testAndCompare: z.object({ maxTitles: figure, maxThumbnails: figure }),
    }),
  ),
  'craft.json': envelope(
    z.object({
      titles: advices,
      thumbnails: advices,
      description: advices,
      comment: advices,
      mobileTitleChars: figure,
    }),
  ),
  'studio.json': envelope(
    z.object({
      madeForKids: z.object({ why: text, source: index }),
      synthetic: z.object({
        rule: text,
        mustDisclose: z.array(text).min(1),
        noNeed: z.array(text).min(1),
        question: text,
        source: index,
      }),
      // Every claim about YouTube says where it comes from, or that it is an assumption (principle V).
      language: z.object({
        why: text,
        basis,
        byRegion: z.object({ espana: text, latam: text, mixto: text }),
      }),
      category: z.object({
        why: text,
        basis,
        list: z.array(text).min(1),
        listBasis: z.object({ assumption: z.literal(true) }),
        suggested: z.object({ value: text, assumption: z.literal(true) }),
      }),
    }),
  ),
} as const

export type PublishFile = keyof typeof PUBLISH_SCHEMAS
export const PUBLISH_FILES = Object.keys(PUBLISH_SCHEMAS) as PublishFile[]
export type PublishPackage<F extends PublishFile> = z.infer<(typeof PUBLISH_SCHEMAS)[F]>
export type YoutubeRules = PublishPackage<'youtube.json'>['data']
export type PublishCraft = PublishPackage<'craft.json'>['data']
export type StudioRules = PublishPackage<'studio.json'>['data']

export interface PublishKnowledge {
  youtube: PublishPackage<'youtube.json'>
  craft: PublishPackage<'craft.json'>
  studio: PublishPackage<'studio.json'>
}

const bundled = import.meta.glob<unknown>('../publish/*.json', { eager: true, import: 'default' })

export function bundledPublishFiles(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(bundled).map(([path, json]) => [path.slice(path.lastIndexOf('/') + 1), json]),
  )
}

/** Validates the packages; throws naming the broken file, so the server refuses to start (principle V). */
export function loadPublishKnowledge(files: Record<string, unknown> = bundledPublishFiles()): PublishKnowledge {
  const read = <F extends PublishFile>(file: F): PublishPackage<F> => {
    if (!(file in files)) throw new Error(`Falta el fichero de conocimiento ${file}`)
    const parsed = PUBLISH_SCHEMAS[file].safeParse(files[file])
    if (!parsed.success)
      throw new Error(`El fichero de conocimiento ${file} no es válido: ${z.prettifyError(parsed.error)}`)
    return parsed.data as PublishPackage<F>
  }
  return { youtube: read('youtube.json'), craft: read('craft.json'), studio: read('studio.json') }
}

/** The packages as Ajustes lists them, with their age (principle V). */
export function publishKnowledgeFiles(publish: PublishKnowledge) {
  // Under its folder: `craft.json` is also a file of the script's package (005).
  return (['youtube', 'craft', 'studio'] as const).map((key) => ({
    file: `publish/${key}.json`,
    label: publish[key].source[0]!.label,
    reviewedAt: publish[key].reviewedAt,
  }))
}
