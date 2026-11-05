import {
  type ApprovalState,
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
} from '@ytcreator/core'
import type { ConceptKnowledge } from '@ytcreator/knowledge'
import {
  asNewBodySchema,
  createChannelBodySchema,
  estimateBodySchema,
  journeyStepBodySchema,
  patchProposalBodySchema,
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
import { inTransaction } from '../../db/transaction.ts'
import type { AiRunService, PromptRef } from '../../services/ai-run.ts'
import { channelInput, previousOf } from '../../services/channel-input.ts'
import { currentReading, readingInput } from '../../services/channel-reading.ts'
import { createConcepts } from '../../services/concepts.ts'
import { createProfile } from '../../services/profile.ts'
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
  jobs: JobsRepo
  aiRun: AiRunService
  promptFor: (use: ChannelUse) => PromptRef
  warningKnowledge: WarningKnowledge
  conceptKnowledge: ConceptKnowledge
  measureStaleDays: number
}

// `perfil_actual` is what the use `lectura_canal` produces; the other kinds have the name of their use.
const useOf = (kind: ProposalKind): ChannelUse => (kind === 'perfil_actual' ? 'lectura_canal' : kind)

// The list a proposal chooses from, for the kinds where approving means choosing one (R14).
const CHOICE_LISTS: Partial<Record<ProposalKind, string>> = {
  nichos: 'niches',
  conceptos: 'concepts',
  nombres: 'names',
}

export function channelRoutes(deps: ChannelRoutesDeps) {
  const { db, channels, journeys, proposals, profiles, measures, names, readings, jobs, aiRun } = deps
  const routes = new Hono()

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
    nameProvisional: channels.get(journey.channelId)?.nameStatus === 'provisional',
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
    sources: deps.conceptKnowledge.sources,
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
        ),
      measures: measures.listByJourney(journey.id),
      nameChecks: names.listByJourney(journey.id),
      jobs: jobs.listByJourney(journey.id),
      warnings: warningsOf(journey.id),
      measureStaleDays: deps.measureStaleDays,
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
    const { use } = await parseBody(c, estimateBodySchema)
    return c.json(aiRun.estimate({ journeyId: journey.id, use, input: inputOf(use, journey) }))
  })

  routes.post('/journeys/:id/proposals', async (c) => {
    const journey = findJourney(c.req.param('id'))
    const body = await parseBody(c, proposalBodySchema)
    checkRevision(journey, body.revision)

    const parent = body.parentId ? proposals.get(body.parentId) : null
    if (body.parentId && (parent?.journeyId !== journey.id || parent.kind !== body.kind)) {
      throw new ApiError({ code: 'no_encontrado' })
    }

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
    return c.json(parent ? proposals.regenerate(parent.id, fresh) : proposals.create(fresh))
  })

  routes.post('/proposals/:id/back', (c) => {
    const proposal = proposals.get(c.req.param('id'))
    if (!proposal) throw new ApiError({ code: 'no_encontrado' })
    if (proposal.status === 'descartada' || !proposal.parentId) throw new ApiError({ code: 'conflicto' })
    return c.json(proposals.goBack(proposal.id))
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
