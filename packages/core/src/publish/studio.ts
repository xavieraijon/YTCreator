import type { AudienceRegion } from '../channel/model.ts'

// The guided list of YouTube Studio, worked out without AI from the profile and the knowledge packages
// (research.md R12, FR-017). The marks of «hecho» are a help: they never stop anything.

export const STUDIO_KEYS = ['publico_infantil', 'contenido_sintetico', 'idioma', 'categoria'] as const
export type StudioKey = (typeof STUDIO_KEYS)[number]

/** What `publish/studio.json` says, as the server reads it (never copied here). */
export interface StudioKnowledge {
  readonly madeForKids: { readonly why: string }
  readonly synthetic: {
    readonly rule: string
    readonly mustDisclose: readonly string[]
    readonly noNeed: readonly string[]
    readonly question: string
  }
  readonly language: { readonly why: string; readonly byRegion: Readonly<Record<AudienceRegion, string>> }
  readonly category: { readonly why: string; readonly suggested: { readonly value: string } }
}

export type StudioItem =
  | {
      readonly key: 'publico_infantil'
      /** What the profile says: whether the channel is made for children; `null` if the profile cannot be read. */
      readonly answer: boolean | null
      readonly why: string
      /** What marking it means, from `market/made-for-kids.json`. */
      readonly implications: readonly string[]
    }
  | {
      readonly key: 'contenido_sintetico'
      /** The app does not know: the creator answers it in YouTube Studio. */
      readonly answer: null
      readonly question: string
      readonly why: string
      readonly mustDisclose: readonly string[]
      readonly noNeed: readonly string[]
    }
  | { readonly key: 'idioma'; readonly answer: string; readonly why: string; readonly assumption: true }
  | { readonly key: 'categoria'; readonly answer: string; readonly why: string; readonly assumption: boolean }

export interface StudioInput {
  readonly audience: { readonly madeForKids: boolean | null; readonly region: AudienceRegion }
  /** The category the channel chose, or `null` if it never did. */
  readonly category: string | null
}

export function studioChecklist(
  input: StudioInput,
  studio: StudioKnowledge,
  kidsImplications: readonly string[],
): StudioItem[] {
  return [
    {
      key: 'publico_infantil',
      answer: input.audience.madeForKids,
      why: studio.madeForKids.why,
      implications: kidsImplications,
    },
    {
      key: 'contenido_sintetico',
      answer: null,
      question: studio.synthetic.question,
      why: studio.synthetic.rule,
      mustDisclose: studio.synthetic.mustDisclose,
      noNeed: studio.synthetic.noNeed,
    },
    // No official page ties the language to the region: it is an assumption (`studio.json`, `language.basis`).
    {
      key: 'idioma',
      answer: studio.language.byRegion[input.audience.region],
      why: studio.language.why,
      assumption: true,
    },
    input.category === null
      ? { key: 'categoria', answer: studio.category.suggested.value, why: studio.category.why, assumption: true }
      : { key: 'categoria', answer: input.category, why: studio.category.why, assumption: false },
  ]
}

/** Only the keys of the list: anything else is not a mark the package keeps. */
export const isStudioKey = (key: string): key is StudioKey => (STUDIO_KEYS as readonly string[]).includes(key)
