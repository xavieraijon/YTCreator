import {
  type ChannelProfile,
  type ChannelUse,
  canMoveIdea,
  channelProfileSchema,
  dropRepeats,
  duplicateOf,
  type Idea,
  ideasOutputFor,
} from '@ytcreator/core'
import {
  batchDecideBodySchema,
  ideaBatchBodySchema,
  ideaEstimateBodySchema,
  ideaPatchBodySchema,
  newIdeaBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { DatabaseSync } from 'node:sqlite'
import type { ChannelsRepo } from '../../db/repos/channels.ts'
import { type CandidateDecision, candidatesOf, type IdeaBatchesRepo } from '../../db/repos/idea-batches.ts'
import type { IdeaMeasuresRepo } from '../../db/repos/idea-measures.ts'
import type { IdeasRepo } from '../../db/repos/ideas.ts'
import type { JobsRepo } from '../../db/repos/jobs.ts'
import type { JourneysRepo } from '../../db/repos/journeys.ts'
import type { ProfilesRepo } from '../../db/repos/profiles.ts'
import { inTransaction } from '../../db/transaction.ts'
import type { AiRunService, PromptRef } from '../../services/ai-run.ts'
import { avoidList, batchView, ideaView, profileInput } from '../../services/ideas.ts'
import { ApiError } from '../errors.ts'
import { parseBody } from '../validate.ts'

export interface IdeaRoutesDeps {
  db: DatabaseSync
  channels: ChannelsRepo
  profiles: ProfilesRepo
  journeys: JourneysRepo
  ideas: IdeasRepo
  batches: IdeaBatchesRepo
  measures: IdeaMeasuresRepo
  jobs: JobsRepo
  aiRun: AiRunService
  promptFor: (use: ChannelUse) => PromptRef
  // `ideas.staleDays` of thresholds.json (FR-010).
  staleDays: number
  now?: () => Date
}

// How many ideas a batch asks for (contracts/ai-uses.md).
const BATCH_SIZE = 8

// The idea bank of a channel (specs/004-idea-bank/contracts/http-api.md).
export function ideaRoutes(deps: IdeaRoutesDeps) {
  const { db, channels, profiles, journeys, ideas, batches, measures, jobs, aiRun } = deps
  const now = deps.now ?? (() => new Date())
  const routes = new Hono()

  // Every route of the bank needs a channel with its profile: the ideas are written for it (US1 AS5).
  const withProfile = (channelId: string) => {
    const channel = channels.get(channelId)
    if (!channel) throw new ApiError({ code: 'no_encontrado' })
    const current = profiles.getCurrent(channel.id)
    if (!current) throw new ApiError({ code: 'conflicto', fields: { profile: 'sin_perfil' } })
    const profile: ChannelProfile = channelProfileSchema.parse(current.profile)
    return { channel, profile, profileVersion: current.version }
  }

  const findIdea = (id: string) => {
    const idea = ideas.get(id)
    if (!idea) throw new ApiError({ code: 'no_encontrado' })
    return { idea, ...withProfile(idea.channelId) }
  }

  const contextOf = (profileVersion: number) => ({ profileVersion, staleDays: deps.staleDays, now: now() })
  const viewOf = (idea: Idea, profileVersion: number) =>
    ideaView(idea, measures.latest(idea.id), contextOf(profileVersion))
  const viewsOf = (channelId: string, profileVersion: number, list: readonly Idea[]) => {
    const latest = measures.latestByChannel(channelId)
    return list.map((idea) => ideaView(idea, latest.get(idea.id) ?? null, contextOf(profileVersion)))
  }

  // The spending is written down on the channel's journey, as with «Regenerar con IA» of the profile (entry 115).
  const journeyOf = (channelId: string) => {
    const journey = journeys.getLast(channelId)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    return journey.id
  }

  const ideasInput = (channelId: string, profile: ChannelProfile) => {
    const avoid = avoidList(ideas.listAll(channelId), batches.list(channelId))
    return { input: { profile: profileInput(profile), avoid: avoid.forAi, count: BATCH_SIZE }, avoidAll: avoid.all }
  }

  // The AI may write a pillar with other capitals (the check ignores them): it is kept as the profile writes it.
  const profilePillar = (pillars: readonly string[], pillar: string) =>
    pillars.find((title) => title.toLowerCase() === pillar.toLowerCase()) ?? pillar

  routes.get('/channels/:id/ideas', (c) => {
    const { channel, profileVersion } = withProfile(c.req.param('id'))
    const pending = batches.pending(channel.id, 'ideas')
    const running = jobs.listByChannel(channel.id, 'medir_ideas').find((job) => job.status === 'en_curso')
    return c.json({
      ideas: viewsOf(channel.id, profileVersion, ideas.listBank(channel.id)),
      queue: ideas.listQueue(channel.id).map((idea) => idea.id),
      profileVersion,
      pendingBatch: pending ? batchView(pending) : null,
      runningJob: running?.id ?? null,
    })
  })

  routes.get('/channels/:id/ideas/archived', (c) => {
    const { channel, profileVersion } = withProfile(c.req.param('id'))
    return c.json(viewsOf(channel.id, profileVersion, ideas.listArchived(channel.id)))
  })

  // «Escribir una idea mía»: it says if the bank already has one with the same title, without stopping it (R15).
  routes.post('/channels/:id/ideas', async (c) => {
    const { channel, profileVersion } = withProfile(c.req.param('id'))
    const body = await parseBody(c, newIdeaBodySchema)
    const duplicate = duplicateOf(body.title, ideas.listAll(channel.id))
    const idea = ideas.create({
      channelId: channel.id,
      origin: 'creador',
      title: body.title,
      format: body.format,
      hook: body.hook ?? '',
      pillar: body.pillar ?? null,
      notes: body.notes ?? '',
      query: body.query ?? null,
      broadQuery: body.broadQuery ?? null,
      queryEn: body.queryEn ?? null,
      profileVersion,
    })
    return c.json({ idea: viewOf(idea, profileVersion), duplicateOf: duplicate }, 201)
  })

  // «Cambiar algo» and the moves of an idea, with its revision: another tab may have changed it first.
  routes.patch('/ideas/:id', async (c) => {
    findIdea(c.req.param('id'))
    const { revision, status, ...fields } = await parseBody(c, ideaPatchBodySchema)
    // Read again after the body, inside the transaction: two tabs at once must not both pass the revision check.
    const { changed, profileVersion } = inTransaction(db, () => {
      const { idea, profileVersion } = findIdea(c.req.param('id'))
      if (revision !== idea.revision) {
        throw new ApiError({ code: 'conflicto', current: viewOf(idea, profileVersion) as never })
      }
      if (status && !canMoveIdea(idea.status, status)) {
        throw new ApiError({ code: 'validacion', fields: { status: 'no_valido' } })
      }
      const edited = Object.keys(fields).length > 0 ? ideas.edit(idea.id, fields) : idea
      return { changed: status ? ideas.setStatus(idea.id, status) : edited, profileVersion }
    })
    return c.json(viewOf(changed!, profileVersion))
  })

  // What a use costs before asking for it (principle III).
  routes.post('/channels/:id/ideas/estimate', async (c) => {
    const { channel, profile } = withProfile(c.req.param('id'))
    const { use } = await parseBody(c, ideaEstimateBodySchema)
    if (use !== 'ideas') throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
    const { input } = ideasInput(channel.id, profile)
    return c.json(aiRun.estimate({ journeyId: journeyOf(channel.id), use, input }))
  })

  // «Proponer ideas de vídeo»: a batch of candidates, waiting for the creator (US1).
  routes.post('/channels/:id/idea-batches', async (c) => {
    const { channel, profile, profileVersion } = withProfile(c.req.param('id'))
    const body = await parseBody(c, ideaBatchBodySchema)
    const { input, avoidAll } = ideasInput(channel.id, profile)
    const result = await aiRun.run({
      estimateId: body.estimateId,
      journeyId: journeyOf(channel.id),
      use: 'ideas',
      input,
      schema: ideasOutputFor(input.profile.pillars),
      ...(body.instructions ? { instructions: body.instructions } : {}),
    })
    if (!result.ok) return c.json({ failure: result.failure })
    // The AI may repeat an idea anyway: it is taken out here against the whole list, and the screen says so (R9).
    const { kept, removed } = dropRepeats(result.value.ideas, avoidAll)
    const drafts = kept.map((draft) => ({ ...draft, pillar: profilePillar(input.profile.pillars, draft.pillar) }))
    const prompt = deps.promptFor('ideas')
    const batch = inTransaction(db, () => {
      // A batch left empty does not take away the one the creator was deciding (entry 17).
      if (drafts.length > 0) batches.discardPending(channel.id, 'ideas')
      return batches.create({
        channelId: channel.id,
        kind: 'ideas',
        payload: { ideas: drafts },
        removedRepeats: removed,
        instructions: body.instructions ?? null,
        promptId: prompt.id,
        promptVersion: prompt.version,
        claimsTrimmed: result.claimsTrimmed,
        usageId: result.usageId,
        profileVersion,
      })
    })
    return c.json(batchView(batch))
  })

  // «Me la quedo» and «No me interesa»: the kept ones go to the end of the bank.
  routes.post('/idea-batches/:id/decide', async (c) => {
    const found = batches.get(c.req.param('id'))
    if (!found) throw new ApiError({ code: 'no_encontrado' })
    const { profileVersion } = withProfile(found.channelId)
    const { keep, discard } = await parseBody(c, batchDecideBodySchema)
    const asked = [...keep, ...discard]
    // Read again after the body, inside the transaction: two «Me la quedo» at once must not make the idea twice.
    const { decided, created } = inTransaction(db, () => {
      const batch = batches.get(found.id)!
      const candidates = candidatesOf(batch) as (Omit<Idea, 'id'> & { why?: string })[]
      if (new Set(asked).size !== asked.length || asked.some((index) => index >= candidates.length)) {
        throw new ApiError({ code: 'validacion', fields: { keep: 'no_valido' } })
      }
      if (asked.some((index) => batch.decisions[index] !== undefined)) throw new ApiError({ code: 'conflicto' })
      const decisions: Record<number, CandidateDecision> = {
        ...Object.fromEntries(keep.map((index) => [index, 'quedada'])),
        ...Object.fromEntries(discard.map((index) => [index, 'descartada'])),
      }
      const made = keep.map((index) => {
        const candidate = candidates[index]!
        return ideas.create({
          channelId: batch.channelId,
          origin: batch.kind === 'otro_enfoque' ? 'otro_enfoque' : 'ia',
          batchId: batch.id,
          sourceIdeaId: batch.sourceIdeaId,
          title: candidate.title,
          hook: candidate.hook,
          pillar: candidate.pillar,
          format: candidate.format,
          query: candidate.query,
          broadQuery: candidate.broadQuery,
          queryEn: candidate.queryEn,
          profileVersion: batch.profileVersion,
        })
      })
      return { decided: batches.decide(batch.id, decisions)!, created: made }
    })
    return c.json({ batch: batchView(decided), created: created.map((idea) => viewOf(idea, profileVersion)) })
  })

  return routes
}
