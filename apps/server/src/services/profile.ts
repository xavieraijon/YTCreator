import {
  channelProfileSchema,
  type ChannelOutput,
  type ChannelProfile,
  type ConceptOutput,
  type JourneyState,
  type PositioningOutput,
  type ProfileExportInput,
  cadenceWithinLimits,
} from '@ytcreator/core'
import type { ConceptFigures } from '@ytcreator/core/api'
import type { ConceptKnowledge } from '@ytcreator/knowledge'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { Journey } from '../db/repos/journeys.ts'
import type { Measure, MeasuresRepo } from '../db/repos/measures.ts'
import type { NamesRepo } from '../db/repos/names.ts'
import type { ProfileVersion, ProfilesRepo } from '../db/repos/profiles.ts'
import type { ProposalsRepo } from '../db/repos/proposals.ts'
import type { ChannelReading } from '../db/repos/readings.ts'
import { chosenOf } from './channel-input.ts'

export interface ProfileDeps {
  channels: ChannelsRepo
  proposals: ProposalsRepo
  measures: Pick<MeasuresRepo, 'listByJourney' | 'get'>
  readings: { get(id: string): ChannelReading | null }
  names: Pick<NamesRepo, 'listByJourney'>
  profiles: ProfilesRepo
  sources: ConceptKnowledge['sources']
  conceptNow: (
    journey: Journey,
    concept: ConceptOutput,
    regionByHand: boolean,
    ownMedianViews?: number | null,
  ) => { concept: ConceptOutput; figures: ConceptFigures }
  figuresFor: (concept: ConceptOutput, views: { medianViews: number | null; ownChannel?: true }) => ConceptFigures
}

const WARNING_SOURCE: Record<string, string | undefined> = {
  infantil: 'made-for-kids',
  no_autentico: 'inauthentic',
  solo_shorts: 'shorts',
}

// The current profile as a text anyone can read, for the context of the profile and its export.
// What the journey decides: the niche and the concept. The name and the sources are left out.
// Not the money, the warnings or the measure: a new measure or newer knowledge move those without the creator choosing
// anything, and that is not going back in the journey.
const pick = ({ niche, concept }: ChannelProfile) => ({
  niche: { label: niche.label, summary: niche.summary },
  concept: {
    promise: concept.promise,
    pillars: concept.pillars,
    audience: concept.audience,
    format: concept.format,
    cadence: concept.cadence,
  },
})

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
export function createProfile(deps: ProfileDeps) {
  const { channels, proposals, measures, readings, names, profiles, sources, conceptNow, figuresFor } = deps
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

  // The kind of content behind the money: from the concept the current version comes from (entry 121). A version
  // brought back comes from the one it copies; any other from the one before it, back to the AI version of a journey.
  // The concept is found by its promise in that proposal, so choosing another one later does not change it.
  const categoryOf = (channelId: string) => {
    const versions = profiles.listVersions(channelId)
    const byNumber = new Map(versions.map((version) => [version.version, version]))
    const seen = new Set<number>()
    let from = versions.at(-1)
    while (from && !(from.origin === 'ia' && from.proposalId !== null) && !seen.has(from.version)) {
      seen.add(from.version)
      from = byNumber.get(
        from.origin === 'restaurada' && from.restoredFrom !== null ? from.restoredFrom : from.version - 1,
      )
    }
    const proposal = from?.proposalId ? proposals.get(from.proposalId) : null
    if (!from || !proposal) return null
    const payload = (proposal.editedPayload ?? proposal.payload) as Partial<ConceptOutput> & {
      concepts?: ConceptOutput[]
    }
    const promise = channelProfileSchema.parse(from.profile).concept.promise
    const concept =
      proposal.kind === 'conceptos'
        ? (payload.concepts?.find((c) => c.promise === promise) ?? payload.concepts?.[proposal.selectedIndex ?? -1])
        : payload
    return concept?.monetization?.category ?? null
  }

  // The money and the warnings worked out again for a profile, as at the end of the journey (entries 114, 117 and 121).
  // With the same answers every warning it had stays, and the words can add more; with other answers the warnings of
  // children and of Shorts follow the new ones. Null when the kind of content behind the money can no longer be found.
  const recalculated = (channelId: string, profile: ChannelProfile, keep: 'all' | 'words'): ChannelProfile | null => {
    const category = categoryOf(channelId)
    if (!category) return null
    const { context, niche } = profile
    const views = context
      ? { medianViews: readings.get(context.readingId)?.summary.long.medianViews ?? null, ownChannel: true as const }
      : { medianViews: niche.measureId ? (measures.get(niche.measureId)?.demandMedianViews ?? null) : null }
    const output: ConceptOutput = {
      promise: profile.concept.promise,
      pillars: profile.concept.pillars,
      audience: profile.concept.audience,
      format: profile.concept.format,
      cadence: profile.concept.cadence,
      monetization: { category, assumptions: profile.concept.monetization.assumptions },
      warnings: profile.concept.warnings
        .map(({ code }) => code)
        .filter((code) => keep === 'all' || code === 'no_autentico'),
    }
    const { concept, warnings } = conceptOf(figuresFor(output, views), output)
    return channelProfileSchema.parse({
      ...profile,
      concept,
      sources: [...knowledgeSources(warnings), ...profile.sources.filter((source) => source.kind === 'youtube')],
    })
  }

  return {
    finish(journey: Journey, { nameLater }: { nameLater: boolean }) {
      const niche = chosenOf<{ label: string; summary: string }>(proposals, journey.id, 'nichos')
      const chosen = chosenOf<ConceptOutput & { regionByHand?: boolean }>(proposals, journey.id, 'conceptos')
      if (!niche || !chosen) throw new Error('El recorrido no tiene nicho y concepto elegidos')
      // FR-022: a channel that already had a name keeps it.
      const { keptName } = journey.state as JourneyState
      // Entry 131: a channel that came back only to change its chosen name, and leaves it for later, keeps the one it had.
      const owner = channels.get(journey.channelId)
      const had =
        owner?.nameStatus === 'elegido' && owner.displayName
          ? { displayName: owner.displayName, handle: owner.handle }
          : null
      const name = nameLater
        ? had
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
      // The version the journey made (an AI version with its proposal), not one rewritten by the AI from the profile.
      const built = profiles.listVersions(journey.channelId).findLast((v) => v.origin === 'ia' && v.proposalId !== null)
      const sameJourney =
        built !== undefined &&
        JSON.stringify(pick(channelProfileSchema.parse(built.profile))) === JSON.stringify(pick(profile))
      const kept = existing ? channelProfileSchema.parse(existing.profile).name : null
      // Nothing changed (the same name, or none chosen): no version that says the same as the one before (entry 131).
      const unchanged =
        existing !== null &&
        sameJourney &&
        kept?.displayName === profile.name.displayName &&
        kept?.handle === profile.name.handle &&
        kept?.status === profile.name.status
      const version = unchanged
        ? existing
        : existing && sameJourney
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

    // A profile changed by hand (entry 117): the words as written; the answers too, and then the money and the
    // warnings are worked out again with the knowledge, as at the end of the journey. Figures sent are never taken.
    // Null when the kind of content behind the money can no longer be found.
    edit(channelId: string, base: ChannelProfile, sent: ChannelProfile): ChannelProfile | null {
      const changed = editedProfile(base, sent)
      if (!cadenceAllowed(base, changed)) return null
      const same = sameAnswers(base, changed)
      // The words decide warnings too (children, content that is not authentic), so they are always looked at again.
      return recalculated(channelId, changed, same ? 'all' : 'words') ?? (same ? changed : null)
    },

    // Whether the money of this channel can be worked out again (the kind of content behind it is still there).
    canRecalculate: (channelId: string) => categoryOf(channelId) !== null,

    // «Volver a medir» (entry 114): the niche with its new measure, and the money worked out again with it.
    // Null if the profile no longer points to the measure measured again (another version was brought back meanwhile).
    remeasured(channelId: string, measure: Measure, previousId: string): ProfileVersion | null {
      const current = profiles.getCurrent(channelId)
      if (!current || !measure.measuredAt) return null
      const base = channelProfileSchema.parse(current.profile)
      if (base.niche.measureId !== previousId) return null
      const measured: ChannelProfile = {
        ...base,
        niche: { ...base.niche, measureId: measure.id },
        sources: [
          ...base.sources.filter((source) => source.id !== base.niche.measureId),
          { id: measure.id, kind: 'youtube', label: 'YouTube', url: null, date: measure.measuredAt },
        ],
      }
      const profile = recalculated(channelId, measured, 'all')
      return profile ? profiles.addVersion(channelId, { origin: 'manual', profile }) : null
    },

    // «Volver a leer tu canal» (entry 125): the channel read again, and the money worked out with what its videos get
    // today. What was said of it («Tu canal hoy») stays: it is the AI's and the creator's, not a figure.
    reread(channelId: string, reading: ChannelReading, previousId: string): ProfileVersion | null {
      const current = profiles.getCurrent(channelId)
      if (!current) return null
      const base = channelProfileSchema.parse(current.profile)
      if (base.context?.readingId !== previousId) return null
      const read: ChannelProfile = {
        ...base,
        context: { ...base.context, readingId: reading.id },
        sources: [
          ...base.sources.filter((source) => source.id !== base.context?.readingId),
          { id: reading.id, kind: 'youtube', label: 'YouTube', url: null, date: reading.fetchedAt },
        ],
      }
      const profile = recalculated(channelId, read, 'all')
      return profile ? profiles.addVersion(channelId, { origin: 'manual', profile }) : null
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

// What the creator can change by hand: the words and the answers (entry 117). The figures and where they come from stay
// as they were (principle V); `edit` works them out again when the answers change.
export function editedProfile(base: ChannelProfile, sent: ChannelProfile): ChannelProfile {
  return channelProfileSchema.parse({
    ...base,
    niche: { ...base.niche, summary: sent.niche.summary },
    concept: {
      ...base.concept,
      promise: sent.concept.promise,
      pillars: sent.concept.pillars,
      audience: sent.concept.audience,
      format: sent.concept.format,
      cadence: sent.concept.cadence,
      // What the AI assumed can be corrected too: after changing the answers it may no longer hold (entry 123).
      monetization: { ...base.concept.monetization, assumptions: sent.concept.monetization.assumptions },
    },
  })
}

// Only what changes is checked, so a figure the AI wrote before can stay while the rest is edited (entry 124).
function cadenceAllowed(base: ChannelProfile, changed: ChannelProfile): boolean {
  return cadenceWithinLimits(base.concept.cadence, changed.concept.cadence)
}

// The answers the money and the warnings rest on (entry 117).
const answersOf = ({ concept }: ChannelProfile) => ({
  region: concept.audience.region,
  madeForKids: concept.audience.madeForKids,
  presence: concept.format.presence,
  cadence: concept.cadence,
})
function sameAnswers(a: ChannelProfile, b: ChannelProfile): boolean {
  return JSON.stringify(answersOf(a)) === JSON.stringify(answersOf(b))
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
