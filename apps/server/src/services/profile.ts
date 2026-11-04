import { channelProfileSchema, type ChannelProfile, type ConceptOutput } from '@ytcreator/core'
import type { ConceptFigures } from '@ytcreator/core/api'
import type { ConceptKnowledge } from '@ytcreator/knowledge'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { Journey } from '../db/repos/journeys.ts'
import type { MeasuresRepo } from '../db/repos/measures.ts'
import type { NamesRepo } from '../db/repos/names.ts'
import type { ProfilesRepo } from '../db/repos/profiles.ts'
import type { ProposalsRepo } from '../db/repos/proposals.ts'
import { chosenOf } from './channel-input.ts'

export interface ProfileDeps {
  channels: ChannelsRepo
  proposals: ProposalsRepo
  measures: Pick<MeasuresRepo, 'listByJourney'>
  names: Pick<NamesRepo, 'listByJourney'>
  profiles: ProfilesRepo
  sources: ConceptKnowledge['sources']
}

const WARNING_SOURCE: Record<string, string | undefined> = {
  infantil: 'made-for-kids',
  no_autentico: 'inauthentic',
  solo_shorts: 'shorts',
}

// The end of a new channel's journey: niche + concept + name make the profile, the same shape for every channel.
export function createProfile({ channels, proposals, measures, names, profiles, sources }: ProfileDeps) {
  return {
    finish(journey: Journey, { nameLater }: { nameLater: boolean }) {
      const niche = chosenOf<{ label: string; summary: string }>(proposals, journey.id, 'nichos')
      const concept = chosenOf<ConceptOutput & { figures: ConceptFigures }>(proposals, journey.id, 'conceptos')
      if (!niche || !concept) throw new Error('El recorrido no tiene nicho y concepto elegidos')
      const name = nameLater
        ? null
        : chosenOf<{ displayName: string; handle: string }>(proposals, journey.id, 'nombres')
      const measure =
        measures.listByJourney(journey.id).findLast((m) => m.nicheLabel === niche.label && m.status === 'medida') ??
        null
      const check =
        name &&
        names.listByJourney(journey.id).findLast((c) => c.displayName === name.displayName && c.handle === name.handle)

      const { figures, monetization } = { figures: concept.figures, monetization: concept.monetization }
      const warnings = figures.warnings.flatMap(({ code }) => {
        const sourceId = WARNING_SOURCE[code]
        return sourceId ? [{ code, sourceId }] : []
      })
      const usedIds = new Set(['rpm', 'ypp', ...warnings.map((warning) => warning.sourceId)])
      const profile: ChannelProfile = channelProfileSchema.parse({
        schemaVersion: 1,
        niche: { label: niche.label, summary: niche.summary, measureId: measure?.id ?? null },
        concept: {
          promise: concept.promise,
          pillars: concept.pillars,
          audience: concept.audience,
          format: concept.format,
          cadence: concept.cadence,
          monetization: { ...figures.monetization, assumptions: monetization.assumptions, sourceIds: ['rpm', 'ypp'] },
          warnings,
        },
        name: {
          displayName: name?.displayName ?? null,
          handle: name?.handle ?? null,
          status: name ? 'elegido' : 'provisional',
          checkId: check?.id ?? null,
        },
        context: null,
        sources: [
          ...sources.filter((source) => usedIds.has(source.id)),
          ...(measure?.measuredAt
            ? [{ id: measure.id, kind: 'youtube', label: 'YouTube', url: null, date: measure.measuredAt }]
            : []),
        ],
      })

      const proposal = proposals.latest(journey.id, 'conceptos')
      const version = profiles.addVersion(journey.channelId, {
        // Choosing the name later is the creator's own change to a profile that already exists.
        origin: profiles.getCurrent(journey.channelId) ? 'manual' : 'ia',
        profile,
        proposalId: proposal?.id ?? null,
      })
      channels.update(journey.channelId, {
        displayName: name?.displayName ?? null,
        handle: name?.handle ?? null,
        nameStatus: name ? 'elegido' : 'provisional',
      })
      return version
    },
  }
}
