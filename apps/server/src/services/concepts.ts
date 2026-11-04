import {
  type ChannelWarning,
  conceptsOutput,
  type ConceptOutput,
  conceptWarnings,
  estimateMonetization,
  warningOfCode,
  type WarningKnowledge,
} from '@ytcreator/core'
import type { ConceptFigures } from '@ytcreator/core/api'
import type { ConceptKnowledge } from '@ytcreator/knowledge'
import type { Journey } from '../db/repos/journeys.ts'
import type { MeasuresRepo } from '../db/repos/measures.ts'

export interface ConceptsDeps {
  measures: Pick<MeasuresRepo, 'listByJourney' | 'listReferences'>
  knowledge: ConceptKnowledge
  warningKnowledge: WarningKnowledge
  sourceLabel: (warning: ChannelWarning) => string | null
}

type NicheChosen = { label: string } | null

// The AI writes the concept; its money ranges and warnings come afterwards from the domain (contracts/ai-uses.md).
export function createConcepts({ measures, knowledge, warningKnowledge, sourceLabel }: ConceptsDeps) {
  const measureOf = (journeyId: string, label: string | undefined) =>
    measures.listByJourney(journeyId).findLast((m) => m.nicheLabel === label && m.status === 'medida') ?? null

  const figuresOf = (journey: Journey, niche: NicheChosen, concept: ConceptOutput): ConceptFigures => {
    const { hoursPerWeek } = journey.state as { hoursPerWeek?: number }
    const warnings = conceptWarnings(concept, hoursPerWeek === undefined ? {} : { hoursPerWeek }, warningKnowledge)
    for (const code of concept.warnings ?? []) {
      if (!warnings.some((warning) => warning.code === code)) warnings.push(warningOfCode(code, warningKnowledge))
    }
    const estimate = estimateMonetization(
      {
        category: concept.monetization.category,
        region: concept.audience.region,
        madeForKids: warnings.some(({ code }) => code === 'infantil'),
        longPerWeek: concept.cadence.longPerWeek,
        medianViews: measureOf(journey.id, niche?.label)?.demandMedianViews ?? null,
      },
      knowledge.monetization,
    )
    return {
      monetization: { ...estimate, rpmSource: knowledge.rpmSource, yppSource: knowledge.yppSource },
      warnings: warnings.map((warning) => ({
        code: warning.code,
        sourceLabel: sourceLabel(warning),
        reviewedAt: warning.reviewedAt,
      })),
    }
  }

  return {
    /** What the AI reads besides the journey's answers: the measure, the references and the knowledge. */
    input(journey: Journey, base: Record<string, unknown>): Record<string, unknown> {
      const measure = measureOf(journey.id, (base['niche'] as NicheChosen)?.label)
      return {
        ...base,
        measure: measure && {
          verdict: measure.verdict,
          demandMedianViews: measure.demandMedianViews,
          entryChannels: measure.entryChannels,
          concentration: measure.concentration,
          recentVideos: measure.recentVideos,
          shortsInSample: measure.shortsInSample,
        },
        references: measure
          ? measures.listReferences(measure.id).map(({ title, subscribers, medianViews, bestVideoTitle }) => ({
              title,
              subscribers,
              medianViews,
              bestVideoTitle,
            }))
          : [],
        knowledge: knowledge.forPrompt,
      }
    },

    /** Validates the concepts and adds their figures; whatever `figures` came in is dropped and worked out again. */
    withFigures(journey: Journey, niche: unknown, payload: unknown) {
      const { concepts } = conceptsOutput.parse(payload)
      return { concepts: concepts.map((c) => ({ ...c, figures: figuresOf(journey, niche as NicheChosen, c) })) }
    },
  }
}
export type ConceptsService = ReturnType<typeof createConcepts>
