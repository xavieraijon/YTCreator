import {
  channelProfileSchema,
  type ChannelOutput,
  type ChannelProfile,
  type ConceptOutput,
  type JourneyState,
  type PositioningOutput,
  type ProfileExportInput,
} from '@ytcreator/core'
import type { ConceptFigures } from '@ytcreator/core/api'
import type { ConceptKnowledge } from '@ytcreator/knowledge'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { Journey } from '../db/repos/journeys.ts'
import type { MeasuresRepo } from '../db/repos/measures.ts'
import type { NamesRepo } from '../db/repos/names.ts'
import type { ProfilesRepo } from '../db/repos/profiles.ts'
import type { ProposalsRepo } from '../db/repos/proposals.ts'
import type { ChannelReading } from '../db/repos/readings.ts'
import { chosenOf } from './channel-input.ts'

export interface ProfileDeps {
  channels: ChannelsRepo
  proposals: ProposalsRepo
  measures: Pick<MeasuresRepo, 'listByJourney'>
  names: Pick<NamesRepo, 'listByJourney'>
  profiles: ProfilesRepo
  sources: ConceptKnowledge['sources']
  conceptNow: (
    journey: Journey,
    concept: ConceptOutput,
    regionByHand: boolean,
    ownMedianViews?: number | null,
  ) => { concept: ConceptOutput; figures: ConceptFigures }
}

const WARNING_SOURCE: Record<string, string | undefined> = {
  infantil: 'made-for-kids',
  no_autentico: 'inauthentic',
  solo_shorts: 'shorts',
}

// The current profile as a text anyone can read, for the context of the profile and its export.
// What the journey decides: the niche and the concept. The name and the sources are left out.
const pick = (profile: ChannelProfile) => ({ niche: profile.niche, concept: profile.concept })

export function currentProfileText(current: ChannelOutput<'lectura_canal'>): string {
  const list = (items: readonly { text: string }[]) => items.map((item) => item.text).join(' ')
  return [
    `Tema: ${current.niche.text}`,
    `Temas del canal: ${list(current.pillars)}`,
    `Público: ${current.audience.text}`,
    ...(current.works.length > 0 ? [`Lo que funciona: ${list(current.works)}`] : []),
    ...(current.doesNotWork.length > 0 ? [`Lo que no funciona: ${list(current.doesNotWork)}`] : []),
  ].join('\n')
}

// The end of either journey: niche + concept + name make the profile, the same shape for every channel.
export function createProfile({ channels, proposals, measures, names, profiles, sources, conceptNow }: ProfileDeps) {
  const conceptOf = (figures: ConceptFigures, concept: ConceptOutput) => {
    const warnings = figures.warnings.flatMap(({ code }) => {
      const sourceId = WARNING_SOURCE[code]
      return sourceId ? [{ code, sourceId }] : []
    })
    return {
      warnings,
      concept: {
        promise: concept.promise,
        pillars: concept.pillars,
        audience: concept.audience,
        format: concept.format,
        cadence: concept.cadence,
        monetization: {
          ...figures.monetization,
          confidence: figures.monetization.rpmSource.confidence,
          assumptions: concept.monetization.assumptions,
          sourceIds: ['rpm', 'ypp'],
        },
        warnings,
      },
    }
  }
  const knowledgeSources = (warnings: readonly { sourceId: string }[]) => {
    const usedIds = new Set(['rpm', 'ypp', ...warnings.map((warning) => warning.sourceId)])
    return sources.filter((source) => usedIds.has(source.id))
  }

  return {
    finish(journey: Journey, { nameLater }: { nameLater: boolean }) {
      const niche = chosenOf<{ label: string; summary: string }>(proposals, journey.id, 'nichos')
      const chosen = chosenOf<ConceptOutput & { regionByHand?: boolean }>(proposals, journey.id, 'conceptos')
      if (!niche || !chosen) throw new Error('El recorrido no tiene nicho y concepto elegidos')
      // FR-022: a channel that already had a name keeps it.
      const { keptName } = journey.state as JourneyState
      const name = nameLater
        ? null
        : (chosenOf<{ displayName: string; handle: string | null }>(proposals, journey.id, 'nombres') ??
          keptName ??
          null)
      const measure =
        measures.listByJourney(journey.id).findLast((m) => m.nicheLabel === niche.label && m.status === 'medida') ??
        null
      const check =
        name &&
        names.listByJourney(journey.id).findLast((c) => c.displayName === name.displayName && c.handle === name.handle)

      // The money and the warnings are worked out now, with the journey as it stands. What the AI wrote, such as the
      // hours in the cadence, stays: if the answers changed, the screen said so before choosing.
      const { concept: now, figures } = conceptNow(journey, chosen, chosen.regionByHand === true)
      const { concept, warnings } = conceptOf(figures, now)
      const profile: ChannelProfile = channelProfileSchema.parse({
        schemaVersion: 1,
        niche: { label: niche.label, summary: niche.summary, measureId: measure?.id ?? null },
        concept,
        name: {
          displayName: name?.displayName ?? null,
          handle: name?.handle ?? null,
          status: name ? 'elegido' : 'provisional',
          checkId: check?.id ?? null,
        },
        context: null,
        sources: [
          ...knowledgeSources(warnings),
          ...(measure?.measuredAt
            ? [{ id: measure.id, kind: 'youtube', label: 'YouTube', url: null, date: measure.measuredAt }]
            : []),
        ],
      })

      const proposal = proposals.latest(journey.id, 'conceptos')
      // Choosing the name later is the creator's own change to a profile that already exists: only the name moves,
      // so what was edited by hand in the profile stays (US5). If on the way the creator went back and chose another
      // niche, concept or rhythm, the journey's profile is the new one, and the old ones stay in the history.
      const existing = profiles.getCurrent(journey.channelId)
      const built = profiles.listVersions(journey.channelId).findLast((v) => v.origin === 'ia')
      const sameJourney =
        built !== undefined &&
        JSON.stringify(pick(channelProfileSchema.parse(built.profile))) === JSON.stringify(pick(profile))
      const version =
        existing && sameJourney
          ? profiles.addVersion(journey.channelId, {
              origin: 'manual',
              profile: { ...channelProfileSchema.parse(existing.profile), name: profile.name },
            })
          : profiles.addVersion(journey.channelId, { origin: 'ia', profile, proposalId: proposal?.id ?? null })
      channels.update(journey.channelId, {
        displayName: name?.displayName ?? null,
        handle: name?.handle ?? null,
        nameStatus: name ? 'elegido' : 'provisional',
      })
      return version
    },

    // The end of an existing channel's journey (FR-021b): the same profile, with what was read kept as its context.
    finishExisting(journey: Journey, reading: ChannelReading) {
      const channel = channels.get(journey.channelId)
      const proposal = proposals.latest(journey.id, 'posicionamiento')
      const currentProposal = proposals.latest(journey.id, 'perfil_actual')
      if (!channel || proposal?.status !== 'aprobada' || currentProposal?.status !== 'aprobada') {
        throw new Error('El recorrido no tiene perfil actual y enfoque aprobados')
      }
      const positioning = (proposal.editedPayload ?? proposal.payload) as PositioningOutput
      const current = (currentProposal.editedPayload ?? currentProposal.payload) as ChannelOutput<'lectura_canal'>
      const { concept: now, figures } = conceptNow(journey, positioning, false, reading.summary.long.medianViews)
      const { concept, warnings } = conceptOf(figures, now)
      const profile: ChannelProfile = channelProfileSchema.parse({
        schemaVersion: 1,
        niche: { label: current.niche.text, summary: current.niche.text, measureId: null },
        concept,
        name: {
          displayName: channel.displayName,
          handle: channel.handle,
          status: channel.displayName ? 'elegido' : 'provisional',
          checkId: null,
        },
        context: { currentProfile: currentProfileText(current), readingId: reading.id },
        sources: [
          ...knowledgeSources(warnings),
          { id: reading.id, kind: 'youtube', label: 'YouTube', url: null, date: reading.fetchedAt },
        ],
      })
      return profiles.addVersion(journey.channelId, { origin: 'ia', profile, proposalId: proposal.id })
    },
  }
}

// What the creator can change by hand: the words. The figures, where they come from and the answers they rest on stay
// as they were (principle V): the money depends on the cadence and the region, and the warnings on the audience.
export function editedProfile(base: ChannelProfile, sent: ChannelProfile): ChannelProfile {
  return channelProfileSchema.parse({
    ...base,
    niche: { ...base.niche, summary: sent.niche.summary },
    concept: {
      ...base.concept,
      promise: sent.concept.promise,
      pillars: sent.concept.pillars,
      audience: { ...base.concept.audience, description: sent.concept.audience.description },
      format: {
        ...base.concept.format,
        longForm: sent.concept.format.longForm,
        shortsRole: sent.concept.format.shortsRole,
      },
    },
  })
}

export type ProfileExportSources = Pick<ProfileDeps, 'channels' | 'profiles'> & {
  measures: Pick<MeasuresRepo, 'get' | 'listReferences'>
  readings: { get(id: string): ChannelReading | null }
}

// Everything the export needs, read from what is saved: nothing is asked of YouTube or the AI.
export function exportInput(
  { channels, profiles, measures, readings }: ProfileExportSources,
  channelId: string,
  exportedAt: string,
): ProfileExportInput | null {
  const channel = channels.get(channelId)
  const current = profiles.getCurrent(channelId)
  if (!channel || !current) return null
  const profile = channelProfileSchema.parse(current.profile)
  const measure = profile.niche.measureId ? measures.get(profile.niche.measureId) : null
  return {
    channel: {
      id: channel.id,
      origin: channel.origin,
      displayName: channel.displayName,
      handle: channel.handle,
      youtubeChannelId: channel.youtubeChannelId,
    },
    version: { version: current.version, origin: current.origin, createdAt: current.createdAt, profile },
    measure,
    references: measure ? measures.listReferences(measure.id) : [],
    reading: profile.context ? readings.get(profile.context.readingId) : null,
    exportedAt,
  }
}
