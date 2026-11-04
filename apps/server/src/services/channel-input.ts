import type { ChannelUse } from '@ytcreator/core'
import type { Journey } from '../db/repos/journeys.ts'
import type { MeasuresRepo } from '../db/repos/measures.ts'
import type { ProposalsRepo } from '../db/repos/proposals.ts'

/** The item chosen from the approved proposal of a kind; null while there is none. */
export function chosenOf<T = unknown>(
  proposals: Pick<ProposalsRepo, 'latest'>,
  journeyId: string,
  kind: 'nichos' | 'conceptos' | 'nombres',
): T | null {
  const proposal = proposals.latest(journeyId, kind)
  if (proposal?.status !== 'aprobada' || proposal.selectedIndex === null) return null
  const payload = (proposal.editedPayload ?? proposal.payload) as Record<string, T[] | undefined>
  const key = { nichos: 'niches', conceptos: 'concepts', nombres: 'names' }[kind]
  return payload[key]?.[proposal.selectedIndex] ?? null
}

// What each use receives inside <datos> (contracts/ai-uses.md). Everything the creator wrote goes here, never in the
// prompt. The uses after the niche get the rest of their data (measures, knowledge, readings) with their own story.
export function channelInput(
  use: ChannelUse,
  journey: Journey,
  proposals: ProposalsRepo,
  measures: Pick<MeasuresRepo, 'listByJourney'>,
): Record<string, unknown> {
  const { state } = journey
  switch (use) {
    case 'preguntas':
      return { interests: state.interests }
    case 'nichos':
      return { interests: state.interests, answers: state.answers ?? [] }
    case 'recomendacion':
      return {
        interests: state.interests,
        niches: measures.listByJourney(journey.id).map((m) => ({
          label: m.nicheLabel,
          verdict: m.verdict,
          failure: m.failure,
          demandMedianViews: m.demandMedianViews,
          entryChannels: m.entryChannels,
          concentration: m.concentration,
          recentVideos: m.recentVideos,
          sampleSize: m.sampleSize,
        })),
      }
    case 'conceptos':
      return {
        niche: chosenOf(proposals, journey.id, 'nichos'),
        hoursPerWeek: state.hoursPerWeek,
        onCamera: state.onCamera,
        audienceRegion: state.audienceRegion,
      }
    case 'nombres': {
      // The money figures are not the AI's business when it comes to names.
      const concept = { ...chosenOf<Record<string, unknown>>(proposals, journey.id, 'conceptos') }
      delete concept['figures']
      return { concept }
    }
    case 'lectura_canal':
    case 'posicionamiento':
      return { channelId: state.resolvedChannelId }
  }
}
