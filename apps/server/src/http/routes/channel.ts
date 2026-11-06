import {
  type ApprovalState,
  type ChannelProfile,
  CHANNEL_OUTPUTS,
  conceptsEditedOutput,
  type ChannelUse,
  positioningEditedOutput,
  type ChannelWarning,
  type JourneyState,
  namesEditedOutput,
  nichesEditedOutput,
  nicheWarnings,
  type WarningKnowledge,
  type ProposalKind,
  initialStep,
  planStep,
  channelProfileSchema,
  exportFileName,
  profileJson,
  profileMarkdown,
  type ProfilePart,
  type ProfilePartOutput,
} from '@ytcreator/core'
import type { ConceptKnowledge } from '@ytcreator/knowledge'
import {
  asNewBodySchema,
  channelNameBodySchema,
  createChannelBodySchema,
  estimateBodySchema,
  exportQuerySchema,
  journeyStepBodySchema,
  patchProposalBodySchema,
  profileEditBodySchema,
  profilePartEstimateBodySchema,
  profileRegenerateBodySchema,
  profileRegeneratedBodySchema,
  profileRestoreBodySchema,
  proposalBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { DatabaseSync } from 'node:sqlite'
import type { ChannelsRepo } from '../../db/repos/channels.ts'
import type { JobsRepo } from '../../db/repos/jobs.ts'
import type { Journey, JourneysRepo } from '../../db/repos/journeys.ts'
import type { MeasuresRepo } from '../../db/repos/measures.ts'
import type { NamesRepo } from '../../db/repos/names.ts'
import type { ProfilesRepo } from '../../db/repos/profiles.ts'
import type { Proposal, ProposalsRepo } from '../../db/repos/proposals.ts'
import type { ReadingsRepo } from '../../db/repos/readings.ts'
import type { Regeneration, RegenerationsRepo } from '../../db/repos/regenerations.ts'
import { inTransaction } from '../../db/transaction.ts'
import type { AiRunService, PromptRef } from '../../services/ai-run.ts'
import { channelInput, previousOf } from '../../services/channel-input.ts'
import { type ChannelReadingService, currentReading, readingInput } from '../../services/channel-reading.ts'
import { createConcepts } from '../../services/concepts.ts'
import type { NicheResearch } from '../../services/niche-research.ts'
import { createProfile, exportInput } from '../../services/profile.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface ChannelRoutesDeps {
  db: DatabaseSync
  channels: ChannelsRepo
  journeys: JourneysRepo
  proposals: ProposalsRepo
  profiles: ProfilesRepo
  measures: MeasuresRepo
  names: NamesRepo
  readings: ReadingsRepo
  regenerations: RegenerationsRepo
  jobs: JobsRepo
  aiRun: AiRunService
  promptFor: (use: ChannelUse) => PromptRef
  warningKnowledge: WarningKnowledge
  conceptKnowledge: ConceptKnowledge
  measureStaleDays: number
  now?: () => Date
  // «Volver a medir» from the profile (entry 114).
  research?: Pick<NicheResearch, 'remeasure'>
  // «Volver a leer tu canal» from the profile (entry 125).
  reading?: Pick<ChannelReadingService, 'reread'>
}

// `perfil_actual` is what the use `lectura_canal` produces; the other kinds have the name of their use.
const useOf = (kind: ProposalKind): ChannelUse => (kind === 'perfil_actual' ? 'lectura_canal' : kind)

// What the AI reads of a saved profile to rewrite one part (entry 115): the texts, the answers and what was read of the
// channel; never the money or the figures of YouTube.
const partInput = (part: ProfilePart, saved: ChannelProfile) => ({
  part,
  profile: {
    niche: { label: saved.niche.label, summary: saved.niche.summary },
    promise: saved.concept.promise,
    pillars: saved.concept.pillars,
    audience: saved.concept.audience,
    format: saved.concept.format,
    cadence: saved.concept.cadence,
  },
  ...(saved.context ? { currentProfile: saved.context.currentProfile } : {}),
})

// Only the part asked for is kept of what the AI gives.
const partOf = (part: ProfilePart, output: ProfilePartOutput): Partial<ProfilePartOutput> =>
  part === 'promesa'
    ? { promise: output.promise }
    : part === 'temas'
      ? { pillars: output.pillars }
      : { audienceDescription: output.audienceDescription }

const withPart = (saved: ChannelProfile, proposed: Partial<ProfilePartOutput>): ChannelProfile => ({
  ...saved,
  concept: {
    ...saved.concept,
    ...(proposed.promise !== undefined ? { promise: proposed.promise } : {}),
    ...(proposed.pillars !== undefined ? { pillars: proposed.pillars } : {}),
    ...(proposed.audienceDescription !== undefined
      ? { audience: { ...saved.concept.audience, description: proposed.audienceDescription } }
      : {}),
  },
})

// What the screen gets of a proposal waiting for the creator's yes (entry 119).
const regenerationView = (pending: Regeneration) => ({
  regenerationId: pending.id,
  part: pending.part,
  baseVersion: pending.baseVersion,
  proposed: pending.proposed,
  claimsTrimmed: pending.claimsTrimmed,
})

// The list a proposal chooses from, for the kinds where approving means choosing one (R14).
const CHOICE_LISTS: Partial<Record<ProposalKind, string>> = {
  nichos: 'niches',
  conceptos: 'concepts',
  nombres: 'names',
}

export function channelRoutes(deps: ChannelRoutesDeps) {
  const { db, channels, journeys, proposals, profiles, measures, names, readings, jobs, aiRun } = deps
  const routes = new Hono()
  const { regenerations } = deps

  const findJourney = (id: string): Journey => {
    const journey = journeys.get(id)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    return journey
  }
  const conflict = (current: Journey) => new ApiError({ code: 'conflicto', current: current as never })
  const checkRevision = (journey: Journey, revision: number) => {
    if (journey.revision !== revision) throw conflict(journey)
  }

  const isApproved = (journeyId: string, kind: ProposalKind) => {
    const proposal = proposals.latest(journeyId, kind)
    if (proposal?.status !== 'aprobada') return false
    return !CHOICE_LISTS[kind] || proposal.selectedIndex !== null
  }

  // What the journey already has: its answers, plus the proposals approved.
  const approvalsOf = (journey: Journey, state: JourneyState): ApprovalState => ({
    interests: state.interests !== undefined,
    questions: true, // they can all be skipped (FR-005)
    niche: isApproved(journey.id, 'nichos'),
    rhythm: state.hoursPerWeek !== undefined && state.onCamera !== undefined,
    // FR-025: a concept of the previous niche has to be chosen again before going on.
    concept: isApproved(journey.id, 'conceptos') && !state.conceptNeedsReview,
    name: isApproved(journey.id, 'nombres') || channels.get(journey.channelId)?.nameStatus === 'elegido',
    channelInput: state.channelInput !== undefined,
    channelConfirmed: state.resolvedChannelId !== undefined,
    reading: isApproved(journey.id, 'perfil_actual'),
    positioning: isApproved(journey.id, 'posicionamiento') && isApproved(journey.id, 'perfil_actual'),
  })

  const sourceLabel = ({ sourceId }: ChannelWarning) => {
    const { madeForKids, inauthentic, shorts } = deps.warningKnowledge
    if (sourceId === 'made-for-kids') return madeForKids.label
    if (sourceId === 'inauthentic') return inauthentic.label
    if (sourceId === 'shorts') return shorts.label
    return null
  }

  const concepts = createConcepts({
    measures,
    knowledge: deps.conceptKnowledge,
    warningKnowledge: deps.warningKnowledge,
    sourceLabel,
  })
  const profile = createProfile({
    channels,
    proposals,
    measures,
    names,
    profiles,
    readings,
    sources: deps.conceptKnowledge.sources,
    figuresFor: concepts.figuresFor,
    conceptNow: (journey, concept, regionByHand, ownMedianViews) =>
      concepts.conceptNow(journey, nicheOf(journey), concept, regionByHand, ownMedianViews),
  })
  // Nothing is asked of the AI about a channel it has nothing to read of: it would only cost money.
  const existingInput = (use: 'lectura_canal' | 'posicionamiento', journey: Journey) => {
    const input = readingInput(use, journey, readings, proposals, deps.conceptKnowledge.forPrompt)
    if (!input) throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
    return input
  }
  const inputOf = (use: ChannelUse, journey: Journey) => {
    if (use === 'lectura_canal' || use === 'posicionamiento') return existingInput(use, journey)
    const base = channelInput(use, journey, proposals, measures)
    return use === 'conceptos' ? concepts.input(journey, base) : base
  }
  const nicheOf = (journey: Journey) => channelInput('conceptos', journey, proposals, measures)['niche']

  const ownMedianViews = (journey: Journey) => currentReading(journey, readings)?.summary.long.medianViews ?? null

  // Changing the audience or the way to appear in the positioning changes the answer of this journey (entries 72 and 75).
  const answersEdited = (journey: Journey, payload: unknown): Journey => {
    const { audience, format } = positioningEditedOutput.parse(payload)
    const { audienceRegion, onCamera } = journey.state as JourneyState
    if (audienceRegion === audience.region && onCamera === format.presence) return journey
    if (audienceRegion !== audience.region) channels.update(journey.channelId, { audienceRegion: audience.region })
    const updated = journeys.update(journey.id, journey.revision, {
      state: { ...journey.state, audienceRegion: audience.region, onCamera: format.presence },
    })
    return updated?.ok ? updated.journey : journey
  }

  // A niche the creator wrote is checked the same as one the AI proposed.
  const warningsOf = (journeyId: string) => {
    const latest = proposals.latest(journeyId, 'nichos')
    const payload = (latest?.editedPayload ?? latest?.payload ?? {}) as {
      niches?: { label: string; summary: string }[]
    }
    return Object.fromEntries(
      (payload.niches ?? []).map((niche) => [
        niche.label,
        nicheWarnings(niche, deps.warningKnowledge).map((warning) => ({
          code: warning.code,
          sourceLabel: sourceLabel(warning),
          reviewedAt: warning.reviewedAt,
        })),
      ]),
    )
  }

  const withCurrentFigures = (journey: Journey, proposal: Proposal): Proposal => {
    const niche = nicheOf(journey)
    return {
      ...proposal,
      payload: concepts.current(journey, niche, proposal.payload),
      ...(proposal.editedPayload ? { editedPayload: concepts.current(journey, niche, proposal.editedPayload) } : {}),
    }
  }

  // What can no longer be read is shown as nothing, so another can be asked for (entry 39).
  const isReadable = ({ kind, payload, editedPayload }: Proposal) =>
    kind !== 'posicionamiento' || positioningEditedOutput.safeParse(editedPayload ?? payload).success

  const withCurrentPositioning = (journey: Journey, proposal: Proposal): Proposal => {
    const median = ownMedianViews(journey)
    const { payload, editedPayload } = proposal
    // Screens read what was edited if there is any: the original is only kept, and may be of an older shape.
    return editedPayload
      ? { ...proposal, editedPayload: concepts.positioningNow(journey, editedPayload, editedPayload, median) }
      : { ...proposal, payload: concepts.positioningNow(journey, payload, payload, median) }
  }

  routes.get('/channels/current', (c) => {
    const channel = channels.getCurrent()
    if (!channel) return c.json({ channel: null })
    return c.json({
      channel,
      profile: profiles.getCurrent(channel.id),
      journey: journeys.getActive(channel.id) ?? journeys.getLast(channel.id),
    })
  })

  // US5: the profile of a channel, its versions, its name and its export.
  const findChannel = (id: string) => {
    const channel = channels.get(id)
    if (!channel) throw new ApiError({ code: 'no_encontrado' })
    return channel
  }
  const currentProfile = (channelId: string) => {
    const current = profiles.getCurrent(channelId)
    if (!current) throw new ApiError({ code: 'no_encontrado' })
    return current
  }

  routes.get('/channels/:id/profile/versions', (c) => {
    const channel = findChannel(c.req.param('id'))
    return c.json(
      profiles.listVersions(channel.id).map(({ version, origin, createdAt }) => ({ version, origin, createdAt })),
    )
  })

  routes.get('/channels/:id/profile/versions/:version', (c) => {
    const channel = findChannel(c.req.param('id'))
    const number = Number(c.req.param('version'))
    const version = Number.isInteger(number) && number > 0 ? profiles.getVersion(channel.id, number) : null
    if (!version) throw new ApiError({ code: 'no_encontrado' })
    return c.json(version)
  })

  routes.put('/channels/:id/profile', async (c) => {
    const channel = findChannel(c.req.param('id'))
    const body = await parseBody(c, profileEditBodySchema)
    const saved = inTransaction(db, () => {
      const current = currentProfile(channel.id)
      // Another tab saved first: nothing is overwritten without seeing it.
      if (current.version !== body.baseVersion) throw new ApiError({ code: 'conflicto' })
      const edited = profile.edit(channel.id, channelProfileSchema.parse(current.profile), body.profile)
      if (!edited) throw new ApiError({ code: 'validacion', fields: { profile: 'no_valido' } })
      return profiles.addVersion(channel.id, { origin: 'manual', profile: edited })
    })
    return c.json(saved)
  })

  routes.post('/channels/:id/profile/restore', async (c) => {
    const channel = findChannel(c.req.param('id'))
    const { version } = await parseBody(c, profileRestoreBodySchema)
    // Going back to a version brings back its content, never an older name: the name is the channel's (entry 103).
    const restored = inTransaction(db, () => {
      const { name } = channelProfileSchema.parse(currentProfile(channel.id).profile)
      return profiles.restore(channel.id, version, (old) => ({ ...channelProfileSchema.parse(old), name }))
    })
    if (!restored) throw new ApiError({ code: 'no_encontrado' })
    return c.json(restored)
  })

  // «Volver a medir» (entry 114): the niche of the profile measured again in the background, with the same searches;
  // when it is measured, a new version of the profile with its figures. A channel read from YouTube has no niche measure.
  routes.post('/channels/:id/profile/remeasure', (c) => {
    const channel = findChannel(c.req.param('id'))
    const { niche, context } = channelProfileSchema.parse(currentProfile(channel.id).profile)
    // A channel read from YouTube is read again instead (entry 125): the figures are those of its own videos.
    if (context) {
      const previous = readings.get(context.readingId)
      const journey = journeys.getLast(channel.id)
      if (!deps.reading || !previous || !journey || !profile.canRecalculate(channel.id)) {
        throw new ApiError({ code: 'validacion', fields: { profile: 'no_valido' } })
      }
      const job = deps.reading.reread(
        journey,
        previous,
        (fresh) => profile.reread(channel.id, fresh, previous.id) !== null,
      )
      if (!job) throw new ApiError({ code: 'conflicto' })
      return c.json({ jobId: job.id }, 202)
    }
    const measure = niche.measureId ? measures.get(niche.measureId) : null
    if (!deps.research || !measure || !profile.canRecalculate(channel.id)) {
      throw new ApiError({ code: 'validacion', fields: { profile: 'no_valido' } })
    }
    // One measure at a time: a second press, or another tab, would spend the quota twice.
    if (jobs.listRunning(measure.journeyId).some((job) => job.kind === 'medir_nichos')) {
      throw new ApiError({ code: 'conflicto' })
    }
    const job = deps.research.remeasure(
      measure,
      (fresh) => inTransaction(db, () => profile.remeasured(channel.id, fresh, measure.id)) !== null,
    )
    return c.json({ jobId: job.id }, 202)
  })

  // «Regenerar con IA» (entry 115): what it costs first, then the proposal, then the creator's yes.
  routes.post('/channels/:id/profile/estimate', async (c) => {
    const channel = findChannel(c.req.param('id'))
    const { part } = await parseBody(c, profilePartEstimateBodySchema)
    const saved = channelProfileSchema.parse(currentProfile(channel.id).profile)
    const journey = journeys.getLast(channel.id)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    return c.json(aiRun.estimate({ journeyId: journey.id, use: 'perfil_parte', input: partInput(part, saved) }))
  })

  routes.post('/channels/:id/profile/regenerate', async (c) => {
    const channel = findChannel(c.req.param('id'))
    const body = await parseBody(c, profileRegenerateBodySchema)
    const current = currentProfile(channel.id)
    if (current.version !== body.baseVersion) throw new ApiError({ code: 'conflicto' })
    const saved = channelProfileSchema.parse(current.profile)
    const journey = journeys.getLast(channel.id)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    const result = await aiRun.run({
      estimateId: body.estimateId,
      // The estimate is this channel's: the spending is written down where it was asked for.
      journeyId: journey.id,
      use: 'perfil_parte',
      input: partInput(body.part, saved),
      ...(body.instructions ? { instructions: body.instructions } : {}),
    })
    if (!result.ok) return c.json({ failure: result.failure })
    // Paid for: it waits saved until the creator says yes or leaves it, even across a restart (entry 119).
    const pending = regenerations.replace({
      channelId: channel.id,
      baseVersion: current.version,
      part: body.part,
      proposed: partOf(body.part, result.value),
      claimsTrimmed: result.claimsTrimmed,
      usageId: result.usageId,
    })
    return c.json(regenerationView(pending))
  })

  // The reading the profile was made from, not the last one: a version brought back keeps its own (FR-027).
  routes.get('/channels/:id/profile/reading', (c) => {
    const channel = findChannel(c.req.param('id'))
    const current = profiles.getCurrent(channel.id)
    const readingId = current ? channelProfileSchema.parse(current.profile).context?.readingId : null
    const reading = readingId ? readings.get(readingId) : null
    return c.json(reading?.channelId === channel.id ? reading : null)
  })

  // The proposal waiting for the creator, if there is one: the screen shows it again on coming back.
  routes.get('/channels/:id/profile/regeneration', (c) => {
    const channel = findChannel(c.req.param('id'))
    const pending = regenerations.latest(channel.id)
    return c.json(pending ? regenerationView(pending) : null)
  })

  // «Descartar»: the creator leaves it. The call stays in the usage log, as every call does.
  routes.delete('/channels/:id/profile/regeneration/:regenerationId', (c) => {
    const channel = findChannel(c.req.param('id'))
    const pending = regenerations.get(c.req.param('regenerationId'))
    if (!pending || pending.channelId !== channel.id) throw new ApiError({ code: 'no_encontrado' })
    regenerations.remove(pending.id)
    return c.body(null, 204)
  })

  routes.post('/channels/:id/profile/regenerated', async (c) => {
    const channel = findChannel(c.req.param('id'))
    const body = await parseBody(c, profileRegeneratedBodySchema)
    const pending = regenerations.get(body.regenerationId)
    if (!pending || pending.channelId !== channel.id) throw new ApiError({ code: 'no_encontrado' })
    const saved = inTransaction(db, () => {
      const current = currentProfile(channel.id)
      // Saved meanwhile: the proposal was written for a profile that is no longer the current one.
      if (current.version !== body.baseVersion || current.version !== pending.baseVersion) {
        throw new ApiError({ code: 'conflicto' })
      }
      const base = channelProfileSchema.parse(current.profile)
      // The words decide some warnings (children, content that is not authentic): looked at again, as when editing.
      const next = profile.edit(channel.id, base, withPart(base, pending.proposed))
      if (!next) throw new ApiError({ code: 'validacion', fields: { regenerationId: 'no_valido' } })
      const version = profiles.addVersion(channel.id, { origin: 'ia', profile: next })
      regenerations.remove(pending.id)
      return version
    })
    return c.json(saved)
  })

  // A new name for a new channel; a channel that already exists keeps the one it has on YouTube (entry 81).
  routes.patch('/channels/:id/name', async (c) => {
    const channel = findChannel(c.req.param('id'))
    const { displayName, handle, checkId } = await parseBody(c, channelNameBodySchema)
    if (channel.origin !== 'nuevo') throw new ApiError({ code: 'validacion', fields: { displayName: 'no_valido' } })
    if (checkId !== undefined) {
      const check = names.get(checkId)
      const owner = check ? journeys.get(check.journeyId) : null
      if (!check || owner?.channelId !== channel.id || check.displayName !== displayName || check.handle !== handle) {
        throw new ApiError({ code: 'validacion', fields: { checkId: 'no_valido' } })
      }
    }
    const renamed = inTransaction(db, () => {
      const current = currentProfile(channel.id)
      const profile = channelProfileSchema.parse(current.profile)
      profiles.addVersion(channel.id, {
        origin: 'manual',
        profile: { ...profile, name: { displayName, handle, status: 'elegido', checkId: checkId ?? null } },
      })
      return channels.update(channel.id, { displayName, handle, nameStatus: 'elegido' })
    })
    return c.json(renamed)
  })

  routes.get('/channels/:id/export', (c) => {
    const channel = findChannel(c.req.param('id'))
    const query = exportQuerySchema.safeParse({ format: c.req.query('format') })
    if (!query.success) throw new ApiError({ code: 'validacion', fields: { format: 'no_valido' } })
    const { format } = query.data
    const input = exportInput(
      { channels, profiles, measures, readings },
      channel.id,
      (deps.now ?? (() => new Date()))().toISOString(),
      {
        hoursPerLongVideo: deps.warningKnowledge.hoursPerLongVideo,
        hoursPerShort: deps.warningKnowledge.hoursPerShort,
      },
    )
    if (!input) throw new ApiError({ code: 'no_encontrado' })
    const name = exportFileName(input.version.profile.name, format)
    return c.body(format === 'md' ? profileMarkdown(input) : `${JSON.stringify(profileJson(input), null, 2)}\n`, 200, {
      'Content-Type': format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    })
  })

  routes.post('/channels', async (c) => {
    const { origin } = await parseBody(c, createChannelBodySchema)
    if (channels.getCurrent()) throw new ApiError({ code: 'conflicto', guard: 'ya_hay_canal' })
    const created = inTransaction(db, () => {
      const channel = channels.create({ origin })
      return { channel, journey: journeys.create({ channelId: channel.id, kind: origin, step: initialStep(origin) }) }
    })
    return c.json(created, 201)
  })

  routes.get('/journeys/:id', (c) => {
    const journey = findJourney(c.req.param('id'))
    return c.json({
      ...journey,
      proposals: proposals
        .list(journey.id)
        .filter((p) => p.status !== 'descartada' && isReadable(p))
        .map((p) =>
          p.kind === 'conceptos'
            ? withCurrentFigures(journey, p)
            : p.kind === 'posicionamiento'
              ? withCurrentPositioning(journey, p)
              : p,
        )
        .map((p) => {
          const newer = proposals.newer(p.id, isReadable)
          return { ...p, newerId: newer?.id ?? null }
        }),
      measures: measures.listByJourney(journey.id),
      nameChecks: names.listByJourney(journey.id),
      jobs: jobs.listByJourney(journey.id),
      warnings: warningsOf(journey.id),
      measureStaleDays: deps.measureStaleDays,
      rhythm: {
        hoursPerLongVideo: deps.warningKnowledge.hoursPerLongVideo,
        hoursPerShort: deps.warningKnowledge.hoursPerShort,
      },
      reading: currentReading(journey, readings),
    })
  })

  routes.post('/journeys/:id/step', async (c) => {
    const journey = findJourney(c.req.param('id'))
    const body = await parseBody(c, journeyStepBodySchema)
    checkRevision(journey, body.revision)

    const state: JourneyState = { ...(journey.state as JourneyState), ...body.data }
    const plan = planStep({
      kind: journey.kind,
      from: journey.step,
      to: body.step,
      approvals: approvalsOf(journey, state),
      ...(body.confirm !== undefined ? { confirm: body.confirm } : {}),
      ...(body.nameLater !== undefined ? { nameLater: body.nameLater } : {}),
    })
    if (!plan.ok) {
      const field = plan.reason === 'requiere_confirmar' ? 'confirm' : 'step'
      throw new ApiError({ code: 'validacion', fields: { [field]: 'no_valido' } })
    }
    // Entry 122: only a new channel changes a name it chose; one that came from YouTube keeps its own (entry 81), unless
    // it still has none to keep (FR-018b).
    if (journey.step === 'hecho' && body.step === 'nombres') {
      const owner = channels.get(journey.channelId)
      if (owner?.origin !== 'nuevo' && owner?.nameStatus === 'elegido') {
        throw new ApiError({ code: 'validacion', fields: { step: 'no_valido' } })
      }
    }

    const next = plan.needsReview ? { ...state, conceptNeedsReview: true } : state
    const updated = inTransaction(db, () => {
      if (body.data?.audienceRegion) {
        channels.update(journey.channelId, { audienceRegion: body.data.audienceRegion })
      }
      if (body.step === 'hecho' && journey.kind === 'nuevo') {
        profile.finish(journey, { nameLater: body.nameLater === true })
      }
      if (body.step === 'hecho' && journey.kind === 'existente') {
        const reading = currentReading(journey, readings)
        if (!reading) throw new ApiError({ code: 'validacion', fields: { step: 'no_valido' } })
        profile.finishExisting(journey, reading)
      }
      return journeys.update(journey.id, body.revision, {
        step: body.step,
        state: next,
        ...(body.step === 'hecho' ? { status: 'terminado' as const } : {}),
        // FR-018b: coming back to choose the name left for later.
        ...(journey.step === 'hecho' ? { status: 'activo' as const } : {}),
      })
    })
    if (!updated) throw new ApiError({ code: 'no_encontrado' })
    if (!updated.ok) throw conflict(updated.current)
    return c.json(updated.journey)
  })

  // FR-022: with too little to read, the journey of a new channel, keeping the name and the @ it has.
  routes.post('/journeys/:id/as-new', async (c) => {
    const journey = findJourney(c.req.param('id'))
    const { revision } = await parseBody(c, asNewBodySchema)
    checkRevision(journey, revision)
    const channel = channels.get(journey.channelId)
    const lowInfo = currentReading(journey, readings)?.summary.lowInfo === true
    if (journey.kind !== 'existente' || journey.step !== 'lectura' || !lowInfo || !channel) {
      throw new ApiError({ code: 'validacion', fields: { step: 'no_valido' } })
    }
    // With no name to keep, the new journey asks for one as it does for anyone.
    const kept = channel.displayName ? { keptName: { displayName: channel.displayName, handle: channel.handle } } : {}
    const created = inTransaction(db, () => {
      const left = journeys.update(journey.id, revision, { status: 'abandonado' })
      if (!left?.ok) throw conflict(left?.current ?? journey)
      const next = journeys.create({ channelId: channel.id, kind: 'nuevo', step: initialStep('nuevo') })
      const updated = journeys.update(next.id, next.revision, { state: kept })
      return updated?.ok ? updated.journey : next
    })
    return c.json({ channel, journey: created }, 201)
  })

  routes.post('/journeys/:id/estimate', async (c) => {
    const journey = findJourney(c.req.param('id'))
    const { use, proposalId } = await parseBody(c, estimateBodySchema)
    const base = inputOf(use, journey)
    // «Proponer otra» sends the proposal being redone: the estimate counts it (P17, contracts/http-api.md).
    const parent = proposalId ? proposals.get(proposalId) : null
    if (proposalId && (parent?.journeyId !== journey.id || useOf(parent.kind) !== use)) {
      throw new ApiError({ code: 'no_encontrado' })
    }
    const input = parent ? { ...base, previous: previousOf(parent.editedPayload ?? parent.payload) } : base
    return c.json(aiRun.estimate({ journeyId: journey.id, use, input }))
  })

  routes.post('/journeys/:id/proposals', async (c) => {
    const journey = findJourney(c.req.param('id'))
    const body = await parseBody(c, proposalBodySchema)
    checkRevision(journey, body.revision)

    const parent = body.parentId ? proposals.get(body.parentId) : null
    if (body.parentId && (parent?.journeyId !== journey.id || parent.kind !== body.kind)) {
      throw new ApiError({ code: 'no_encontrado' })
    }
    // A batch no longer in use cannot be redone (P3); it is checked again when the AI answers.
    if (parent?.status === 'descartada') throw new ApiError({ code: 'conflicto' })

    const use = useOf(body.kind)
    const base = inputOf(use, journey)
    const input = parent ? { ...base, previous: previousOf(parent.editedPayload ?? parent.payload) } : base
    // Taken before asking: what the concepts are written for, even if something changes while the AI answers.
    const niche = nicheOf(journey)
    const result = await aiRun.run({
      estimateId: body.estimateId,
      use,
      input,
      ...(body.instructions ? { instructions: body.instructions } : {}),
    })
    if (!result.ok) return c.json({ failure: result.failure })

    // The creator moved to another channel while the AI answered: this was about the previous one (spent, not kept).
    const latest = journeys.get(journey.id)
    if (
      (latest?.state as JourneyState | undefined)?.resolvedChannelId !==
      (journey.state as JourneyState).resolvedChannelId
    ) {
      throw conflict(latest ?? journey)
    }

    const prompt = deps.promptFor(use)
    const fresh = {
      journeyId: journey.id,
      kind: body.kind,
      payload:
        body.kind === 'conceptos'
          ? concepts.written(journey, niche, result.value)
          : body.kind === 'posicionamiento'
            ? concepts.positioned(journey, result.value, base['currentProfile'], ownMedianViews(journey))
            : result.value,
      promptId: prompt.id,
      promptVersion: prompt.version,
      instructions: body.instructions ?? null,
      claimsTrimmed: result.claimsTrimmed,
      usageId: result.usageId,
    }
    if (!parent) return c.json(proposals.create(fresh))
    // Checked again now: the batch may have been left while the AI answered (spent, not kept, as above).
    const made = proposals.regenerate(parent.id, fresh)
    if (!made) throw new ApiError({ code: 'conflicto' })
    return c.json(made)
  })

  routes.post('/proposals/:id/back', (c) => {
    const proposal = proposals.get(c.req.param('id'))
    if (!proposal) throw new ApiError({ code: 'no_encontrado' })
    if (proposal.status === 'descartada' || !proposal.parentId) throw new ApiError({ code: 'conflicto' })
    return c.json(proposals.goBack(proposal.id))
  })

  // P3: going back keeps the newer batch, and this brings it back.
  routes.post('/proposals/:id/forward', (c) => {
    const proposal = proposals.get(c.req.param('id'))
    if (!proposal) throw new ApiError({ code: 'no_encontrado' })
    const next = proposals.goForward(proposal.id, isReadable)
    if (!next) throw new ApiError({ code: 'conflicto' })
    return c.json(next)
  })

  routes.patch('/proposals/:id', async (c) => {
    const proposal = proposals.get(c.req.param('id'))
    if (!proposal) throw new ApiError({ code: 'no_encontrado' })
    const body = await parseBody(c, patchProposalBodySchema)
    if (proposal.status === 'descartada') throw new ApiError({ code: 'conflicto' })

    if (body.editedPayload !== undefined) {
      const schema =
        proposal.kind === 'nichos'
          ? nichesEditedOutput
          : proposal.kind === 'nombres'
            ? namesEditedOutput
            : proposal.kind === 'conceptos'
              ? conceptsEditedOutput
              : proposal.kind === 'posicionamiento'
                ? positioningEditedOutput
                : CHANNEL_OUTPUTS[useOf(proposal.kind)]
      if (!schema.safeParse(body.editedPayload).success) {
        throw new ApiError({ code: 'validacion', fields: { editedPayload: 'no_valido' } })
      }
      const owner = journeys.get(proposal.journeyId)
      const stored = proposal.editedPayload ?? proposal.payload
      const answered = owner && proposal.kind === 'posicionamiento' ? answersEdited(owner, body.editedPayload) : owner
      proposals.edit(
        proposal.id,
        proposal.kind === 'conceptos' && owner
          ? concepts.edited(owner, nicheOf(owner), body.editedPayload, stored)
          : proposal.kind === 'posicionamiento' && answered
            ? concepts.positioningNow(answered, body.editedPayload, stored, ownMedianViews(answered))
            : body.editedPayload,
      )
    }
    if (body.status === 'descartada') return c.json(proposals.discard(proposal.id))

    // Choosing one is approving it (R14); a choice list needs the choice.
    if (body.status === 'aprobada' || body.selectedIndex !== undefined) {
      const listKey = CHOICE_LISTS[proposal.kind]
      const current = proposals.get(proposal.id)!
      const list = listKey
        ? ((current.editedPayload ?? current.payload) as Record<string, unknown[] | undefined>)
        : null
      const size = listKey ? (list?.[listKey]?.length ?? 0) : null
      const index = body.selectedIndex ?? null
      const validChoice = size === null ? index === null : index !== null && index < size
      if (!validChoice) throw new ApiError({ code: 'validacion', fields: { selectedIndex: 'no_valido' } })
      const approved = proposals.approve(proposal.id, index)

      // FR-025: the concept chosen again is no longer pending review.
      const journey = journeys.get(proposal.journeyId)
      if (proposal.kind === 'conceptos' && journey && (journey.state as JourneyState).conceptNeedsReview) {
        const state: JourneyState = { ...(journey.state as JourneyState) }
        delete state.conceptNeedsReview
        journeys.update(journey.id, journey.revision, { state })
      }
      return c.json(approved)
    }
    return c.json(proposals.get(proposal.id))
  })

  return routes
}
