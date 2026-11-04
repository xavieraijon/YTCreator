import type { WarningCode } from './outputs.ts'

// Warnings of a niche or a concept (FR-015, US1 AS7). Rules of the domain, with the source of each one.
export interface WarningKnowledge {
  madeForKids: { reviewedAt: string; label: string; audienceKeywords: readonly string[] }
  inauthentic: { reviewedAt: string; label: string; keywords: readonly string[] }
  shorts: { reviewedAt: string; label: string }
  ypp: {
    reviewedAt: string
    label: string
    ads: { subscribers: number; watchHours: number; shortsViews: number }
  }
  // What a video takes, to tell whether the rhythm fits the hours the creator has.
  hoursPerLongVideo: number
  hoursPerShort: number
}

export type ChannelWarningCode = WarningCode | 'ritmo_insostenible'

export interface ChannelWarning {
  code: ChannelWarningCode
  sourceId: string | null // null: it comes from the creator's own hours, not from the knowledge package
  reviewedAt: string | null
}

export interface ConceptForWarnings {
  audience: { description: string; madeForKids: boolean }
  format: { longForm: string; shortsRole: string }
  cadence: { longPerWeek: number; shortsPerWeek: number }
}

export interface NicheForWarnings {
  label: string
  summary: string
  shortsOnly?: boolean
}

const hasWord = (text: string, words: readonly string[]) =>
  words.some((word) => new RegExp(`(?<![\\p{L}\\p{N}])${word}(?:e?s)?(?![\\p{L}\\p{N}])`, 'iu').test(text))

const kids = (k: WarningKnowledge): ChannelWarning => ({
  code: 'infantil',
  sourceId: 'made-for-kids',
  reviewedAt: k.madeForKids.reviewedAt,
})
const inauthentic = (k: WarningKnowledge): ChannelWarning => ({
  code: 'no_autentico',
  sourceId: 'inauthentic',
  reviewedAt: k.inauthentic.reviewedAt,
})
const onlyShorts = (k: WarningKnowledge): ChannelWarning => ({
  code: 'solo_shorts',
  sourceId: 'shorts',
  reviewedAt: k.shorts.reviewedAt,
})

/** The warning of a code the AI proposed, with the source it would have by the domain's rule. */
export function warningOfCode(code: ChannelWarningCode, knowledge: WarningKnowledge): ChannelWarning {
  if (code === 'infantil') return kids(knowledge)
  if (code === 'no_autentico') return inauthentic(knowledge)
  if (code === 'solo_shorts') return onlyShorts(knowledge)
  return { code, sourceId: null, reviewedAt: null }
}

export function conceptWarnings(
  concept: ConceptForWarnings,
  { hoursPerWeek }: { hoursPerWeek?: number },
  knowledge: WarningKnowledge,
): ChannelWarning[] {
  const warnings: ChannelWarning[] = []
  // The AI may say it is not for children, but the audience it describes decides too (contracts/ai-uses.md).
  if (concept.audience.madeForKids || hasWord(concept.audience.description, knowledge.madeForKids.audienceKeywords)) {
    warnings.push(kids(knowledge))
  }
  if (hasWord(`${concept.format.longForm} ${concept.format.shortsRole}`, knowledge.inauthentic.keywords)) {
    warnings.push(inauthentic(knowledge))
  }
  const { longPerWeek, shortsPerWeek } = concept.cadence
  if (longPerWeek === 0 && shortsPerWeek > 0) warnings.push(onlyShorts(knowledge))
  if (hoursPerWeek !== undefined) {
    const needed = longPerWeek * knowledge.hoursPerLongVideo + shortsPerWeek * knowledge.hoursPerShort
    if (needed > hoursPerWeek) warnings.push({ code: 'ritmo_insostenible', sourceId: null, reviewedAt: null })
  }
  return warnings
}

export function nicheWarnings(niche: NicheForWarnings, knowledge: WarningKnowledge): ChannelWarning[] {
  const text = `${niche.label} ${niche.summary}`
  const warnings: ChannelWarning[] = []
  if (hasWord(text, knowledge.madeForKids.audienceKeywords)) warnings.push(kids(knowledge))
  if (hasWord(text, knowledge.inauthentic.keywords)) warnings.push(inauthentic(knowledge))
  if (niche.shortsOnly) warnings.push(onlyShorts(knowledge))
  return warnings
}

// What the partner programme asks for, with its source; the concept shows it next to the money ranges.
export function yppSummary(knowledge: WarningKnowledge) {
  return { ...knowledge.ypp.ads, sourceId: 'ypp', reviewedAt: knowledge.ypp.reviewedAt }
}
