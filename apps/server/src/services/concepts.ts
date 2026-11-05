import {
  type ChannelWarning,
  conceptsEditedOutput,
  type ConceptOutput,
  conceptWarnings,
  estimateMonetization,
  warningOfCode,
  type WarningKnowledge,
} from '@ytcreator/core'
import type { BasedOn, ConceptFigures } from '@ytcreator/core/api'
import type { ConceptKnowledge } from '@ytcreator/knowledge'
import type { Journey } from '../db/repos/journeys.ts'
import type { MeasuresRepo } from '../db/repos/measures.ts'
import { followingJourney, recentOf } from './channel-input.ts'

export interface ConceptsDeps {
  measures: Pick<MeasuresRepo, 'listByJourney' | 'listReferences'>
  knowledge: ConceptKnowledge
  warningKnowledge: WarningKnowledge
  sourceLabel: (warning: ChannelWarning) => string | null
}

type NicheChosen = { label: string } | null
type Stored = { basedOn?: BasedOn; concepts?: { regionByHand?: boolean; audience?: { region?: string } }[] }

const basedOnNow = (journey: Journey, niche: NicheChosen): BasedOn => {
  const { hoursPerWeek, onCamera } = journey.state as { hoursPerWeek?: number; onCamera?: string }
  return {
    nicheLabel: niche?.label ?? null,
    hoursPerWeek: hoursPerWeek ?? null,
    onCamera: onCamera ?? null,
  }
}

// The audience only changes the money (spec, Assumptions), which follows it: other text is not needed for that.
const sameAnswers = (a: BasedOn, b: BasedOn) =>
  a.nicheLabel === b.nicheLabel &&
  (a.hoursPerWeek ?? null) === (b.hoursPerWeek ?? null) &&
  (a.onCamera ?? null) === (b.onCamera ?? null)

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

  const conceptNow = (journey: Journey, niche: unknown, concept: ConceptOutput, regionByHand: boolean) => {
    const now = followingJourney(journey, concept, regionByHand)
    return { concept: now, figures: figuresOf(journey, niche as NicheChosen, now) }
  }

  const build = (
    journey: Journey,
    niche: unknown,
    concepts: ConceptOutput[],
    basedOn: BasedOn,
    byHand: (index: number, concept: ConceptOutput) => boolean,
  ) => ({
    concepts: concepts.map((c, index) => {
      const regionByHand = byHand(index, c)
      const now = conceptNow(journey, niche, c, regionByHand)
      return { ...now.concept, figures: now.figures, ...(regionByHand ? { regionByHand } : {}) }
    }),
    basedOn,
  })

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
          ...recentOf(measure),
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

    /** What the AI answered, with its figures. Whatever `figures` came in is dropped and worked out again. */
    written(journey: Journey, niche: unknown, payload: unknown) {
      const { concepts } = conceptsEditedOutput.parse(payload)
      return build(journey, niche, concepts, basedOnNow(journey, niche as NicheChosen), () => false)
    },

    /** An edit keeps what the concepts were written for. The screen sends back the region it was shown, which follows
     * the journey: only another one was set by hand. */
    edited(journey: Journey, niche: unknown, payload: unknown, stored: unknown) {
      const { concepts } = conceptsEditedOutput.parse(payload)
      const { audienceRegion } = journey.state as { audienceRegion?: string }
      const { basedOn, concepts: before } = (stored ?? {}) as Stored
      return build(
        journey,
        niche,
        concepts,
        basedOn ?? basedOnNow(journey, niche as NicheChosen),
        (index, { audience: { region } }) => {
          if (audienceRegion === undefined) return false
          const was = before?.[index]
          return region !== audienceRegion || (was?.regionByHand === true && was.audience?.region === region)
        },
      )
    },

    /** The stored figures are only what they were when written: what is shown is worked out from the journey as it is. */
    current(journey: Journey, niche: unknown, payload: unknown) {
      // Something saved that can no longer be read is shown as nothing, so the concepts can be asked for again.
      const parsed = conceptsEditedOutput.safeParse(payload)
      const stored = (payload ?? {}) as Stored
      const now = basedOnNow(journey, niche as NicheChosen)
      const basedOn = stored.basedOn ?? now
      return {
        ...build(
          journey,
          niche,
          parsed.success ? parsed.data.concepts : [],
          basedOn,
          (index) => stored.concepts?.[index]?.regionByHand === true,
        ),
        stale: !sameAnswers(basedOn, now),
      }
    },

    /** The concept chosen as it stands now, with its figures, for the profile. */
    conceptNow,
  }
}
export type ConceptsService = ReturnType<typeof createConcepts>
