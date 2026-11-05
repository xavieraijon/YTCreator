import type { ChannelUse, ConceptOutput } from '@ytcreator/core'
import type { Journey } from '../db/repos/journeys.ts'
import type { Measure, MeasuresRepo } from '../db/repos/measures.ts'
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

// Without a key only the newest videos of each channel have a date: that count is low by nature and misleads the AI.
export const recentOf = ({ source, recentVideos }: Pick<Measure, 'source' | 'recentVideos'>) =>
  source === 'ytdlp' ? {} : { recentVideos }

// There is one audience answer in the journey: a concept follows it, unless the creator gave that concept another by
// hand. Never the AI's call.
export const followingJourney = <T extends Pick<ConceptOutput, 'audience'>>(
  journey: Journey,
  concept: T,
  regionByHand: boolean,
): T => {
  const { audienceRegion } = journey.state as { audienceRegion?: ConceptOutput['audience']['region'] }
  if (!audienceRegion || regionByHand) return concept
  return { ...concept, audience: { ...concept.audience, region: audienceRegion } }
}

// What the AI reads of the proposal it is asked to redo. The money figures may be out of date and are not its business:
// what it is given is taken as a valid source for what it writes (claims.ts).
export function previousOf(payload: unknown): unknown {
  const written = (concept: Record<string, unknown>) => {
    const kept = { ...concept }
    delete kept['figures']
    delete kept['regionByHand']
    delete kept['basedOn']
    return kept
  }
  const { concepts, promise } = payload as { concepts?: Record<string, unknown>[]; promise?: string }
  if (concepts) return { concepts: concepts.map(written) }
  // A positioning is one concept with its changes.
  return promise === undefined ? payload : written(payload as Record<string, unknown>)
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
          ...recentOf(m),
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
      const chosen = chosenOf<ConceptOutput & { regionByHand?: boolean }>(proposals, journey.id, 'conceptos')
      if (!chosen) return { concept: {} }
      const concept: Record<string, unknown> = { ...followingJourney(journey, chosen, chosen.regionByHand === true) }
      delete concept['figures']
      delete concept['regionByHand']
      return { concept }
    }
    // What was read of the channel comes from its own service (channel-reading.ts).
    case 'lectura_canal':
    case 'posicionamiento':
      return {}
  }
}
