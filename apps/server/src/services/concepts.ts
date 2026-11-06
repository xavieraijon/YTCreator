import {
  type ChannelWarning,
  type JourneyState,
  conceptsEditedOutput,
  type ConceptOutput,
  conceptWarnings,
  positioningEditedOutput,
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

  // The money and the warnings of a concept, from its answers and what a video gets (of the niche, or of the channel).
  const figuresWith = (
    concept: ConceptOutput,
    hoursPerWeek: number | undefined,
    views: { medianViews: number | null; ownChannel?: true },
  ): ConceptFigures => {
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
        ...views,
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

  const figuresOf = (
    journey: Journey,
    niche: NicheChosen,
    concept: ConceptOutput,
    ownMedianViews?: number | null,
  ): ConceptFigures => {
    const { hoursPerWeek } = journey.state as { hoursPerWeek?: number }
    return figuresWith(
      concept,
      hoursPerWeek,
      ownMedianViews === undefined
        ? { medianViews: measureOf(journey.id, niche?.label)?.demandMedianViews ?? null }
        : { medianViews: ownMedianViews ?? null, ownChannel: true },
    )
  }

  // The hours and the way to appear of a positioning are what the creator answered, not what the AI wrote (entry 72).
  const answered = (journey: Journey, concept: ConceptOutput): ConceptOutput => {
    const { hoursPerWeek, onCamera } = journey.state as JourneyState
    return {
      ...concept,
      cadence: { ...concept.cadence, hoursPerWeek: hoursPerWeek ?? concept.cadence.hoursPerWeek },
      format: { ...concept.format, presence: onCamera ?? concept.format.presence },
    }
  }

  // `ownMedianViews`, for a channel that exists: what a long video of its own gets, in place of a measure of the niche.
  const conceptNow = (
    journey: Journey,
    niche: unknown,
    concept: ConceptOutput,
    regionByHand: boolean,
    ownMedianViews?: number | null,
  ) => {
    const now = followingJourney(
      journey,
      ownMedianViews === undefined ? concept : answered(journey, concept),
      regionByHand,
    )
    return { concept: now, figures: figuresOf(journey, niche as NicheChosen, now, ownMedianViews) }
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

    /** A positioning is one concept with its changes, and its figures: the money comes from the channel's own videos.
     * It keeps what it was written from, to say so if that changes later. */
    positioned(journey: Journey, payload: unknown, currentProfile: unknown, ownMedianViews: number | null) {
      const parsed = positioningEditedOutput.parse(payload)
      const now = conceptNow(journey, null, parsed, false, ownMedianViews)
      const { hoursPerWeek, onCamera } = journey.state as JourneyState
      return { ...now.concept, figures: now.figures, basedOn: { currentProfile, hoursPerWeek, onCamera } }
    },

    /** As it stands now: the answers, the audience and the channel's own videos may have changed since it was saved. An
     * edit takes this way too: the route has already taken what it changed of the answers. */
    positioningNow(journey: Journey, payload: unknown, stored: unknown, ownMedianViews: number | null) {
      const parsed = positioningEditedOutput.parse(payload)
      const now = conceptNow(journey, null, parsed, false, ownMedianViews)
      const { basedOn } = (stored ?? {}) as { basedOn?: unknown }
      return { ...now.concept, figures: now.figures, basedOn }
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

    // A profile edited by hand (entry 117): the hours are the ones in the profile now, not the journey's.
    figuresFor: (concept: ConceptOutput, views: { medianViews: number | null; ownChannel?: true }) =>
      figuresWith(concept, concept.cadence.hoursPerWeek, views),

    /** The concept chosen as it stands now, with its figures, for the profile. */
    conceptNow,
  }
}
export type ConceptsService = ReturnType<typeof createConcepts>
