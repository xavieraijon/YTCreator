import type { ChannelUse } from '@ytcreator/core'
import type { Journey } from '../db/repos/journeys.ts'
import type { MeasuresRepo } from '../db/repos/measures.ts'
import type { ProposalsRepo } from '../db/repos/proposals.ts'

// What each use receives inside <datos> (contracts/ai-uses.md). Everything the creator wrote goes here, never in the
// prompt. The uses after the niche get the rest of their data (measures, knowledge, readings) with their own story.
export function channelInput(
  use: ChannelUse,
  journey: Journey,
  proposals: ProposalsRepo,
  measures: Pick<MeasuresRepo, 'listByJourney'>,
): Record<string, unknown> {
  const { state } = journey
  const chosen = (kind: 'nichos' | 'conceptos') => {
    const proposal = proposals.latest(journey.id, kind)
    if (proposal?.status !== 'aprobada' || proposal.selectedIndex === null) return null
    const payload = (proposal.editedPayload ?? proposal.payload) as Record<string, unknown[]>
    const list = payload[kind === 'nichos' ? 'niches' : 'concepts']
    return list?.[proposal.selectedIndex] ?? null
  }
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
        niche: chosen('nichos'),
        hoursPerWeek: state.hoursPerWeek,
        onCamera: state.onCamera,
        audienceRegion: state.audienceRegion,
      }
    case 'nombres':
      return { concept: chosen('conceptos') }
    case 'lectura_canal':
    case 'posicionamiento':
      return { channelId: state.resolvedChannelId }
  }
}
