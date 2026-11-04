import {
  type ApprovalState,
  CHANNEL_OUTPUTS,
  type ChannelUse,
  type ChannelWarning,
  type JourneyState,
  nichesEditedOutput,
  nicheWarnings,
  type WarningKnowledge,
  type ProposalKind,
  initialStep,
  planStep,
} from '@ytcreator/core'
import {
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
import type { ProposalsRepo } from '../../db/repos/proposals.ts'
import { inTransaction } from '../../db/transaction.ts'
import type { AiRunService, PromptRef } from '../../services/ai-run.ts'
import { channelInput } from '../../services/channel-input.ts'
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
  jobs: JobsRepo
  aiRun: AiRunService
  promptFor: (use: ChannelUse) => PromptRef
  warningKnowledge: WarningKnowledge
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
  const { db, channels, journeys, proposals, profiles, measures, names, jobs, aiRun } = deps
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
    concept: isApproved(journey.id, 'conceptos'),
    name: isApproved(journey.id, 'nombres') || channels.get(journey.channelId)?.nameStatus === 'elegido',
    channelInput: state.channelInput !== undefined,
    channelConfirmed: state.resolvedChannelId !== undefined,
    reading: isApproved(journey.id, 'perfil_actual'),
    positioning: isApproved(journey.id, 'posicionamiento'),
  })

  const sourceLabel = ({ sourceId }: ChannelWarning) => {
    const { madeForKids, inauthentic, shorts } = deps.warningKnowledge
    if (sourceId === 'made-for-kids') return madeForKids.label
    if (sourceId === 'inauthentic') return inauthentic.label
    if (sourceId === 'shorts') return shorts.label
    return null
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
      proposals: proposals.list(journey.id).filter((p) => p.status !== 'descartada'),
      measures: measures.listByJourney(journey.id),
      nameChecks: names.listByJourney(journey.id),
      jobs: jobs.listByJourney(journey.id),
      warnings: warningsOf(journey.id),
      measureStaleDays: deps.measureStaleDays,
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
      return journeys.update(journey.id, body.revision, {
        step: body.step,
        state: next,
        ...(body.step === 'hecho' ? { status: 'terminado' as const } : {}),
      })
    })
    if (!updated) throw new ApiError({ code: 'no_encontrado' })
    if (!updated.ok) throw conflict(updated.current)
    return c.json(updated.journey)
  })

  routes.post('/journeys/:id/estimate', async (c) => {
    const journey = findJourney(c.req.param('id'))
    const { use } = await parseBody(c, estimateBodySchema)
    return c.json(
      aiRun.estimate({ journeyId: journey.id, use, input: channelInput(use, journey, proposals, measures) }),
    )
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
    const base = channelInput(use, journey, proposals, measures)
    const input = parent ? { ...base, previous: parent.editedPayload ?? parent.payload } : base
    const result = await aiRun.run({
      estimateId: body.estimateId,
      use,
      input,
      ...(body.instructions ? { instructions: body.instructions } : {}),
    })
    if (!result.ok) return c.json({ failure: result.failure })

    const prompt = deps.promptFor(use)
    const fresh = {
      journeyId: journey.id,
      kind: body.kind,
      payload: result.value,
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
      const schema = proposal.kind === 'nichos' ? nichesEditedOutput : CHANNEL_OUTPUTS[useOf(proposal.kind)]
      if (!schema.safeParse(body.editedPayload).success) {
        throw new ApiError({ code: 'validacion', fields: { editedPayload: 'no_valido' } })
      }
      proposals.edit(proposal.id, body.editedPayload)
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
