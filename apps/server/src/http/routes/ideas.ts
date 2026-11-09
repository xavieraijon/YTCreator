import {
  anglesOutputFor,
  bankFileName,
  bankJson,
  bankMarkdown,
  type ChannelProfile,
  type ChannelUse,
  canMoveIdea,
  channelProfileSchema,
  dropRepeats,
  duplicateOf,
  type Idea,
  ideaMeasureUnits,
  ideasOutputFor,
  type ScriptStatus,
  type YouTubeSource,
} from '@ytcreator/core'
import {
  anglesBodySchema,
  batchDecideBodySchema,
  exportQuerySchema,
  ideaBatchBodySchema,
  ideaEstimateBodySchema,
  ideaMeasuresBodySchema,
  ideaOrderBodySchema,
  ideaPatchBodySchema,
  ideaQueriesBodySchema,
  measureEstimateBodySchema,
  newIdeaBodySchema,
} from '@ytcreator/core/api'
import { Hono } from 'hono'
import type { DatabaseSync } from 'node:sqlite'
import type { ChannelsRepo } from '../../db/repos/channels.ts'
import { type CandidateDecision, candidatesOf, type IdeaBatchesRepo } from '../../db/repos/idea-batches.ts'
import type { IdeaMeasure, IdeaMeasuresRepo } from '../../db/repos/idea-measures.ts'
import { IdeaOrderError, type IdeasRepo } from '../../db/repos/ideas.ts'
import type { JobsRepo } from '../../db/repos/jobs.ts'
import type { JourneysRepo } from '../../db/repos/journeys.ts'
import type { ProfilesRepo } from '../../db/repos/profiles.ts'
import { inTransaction } from '../../db/transaction.ts'
import type { AiRunService, PromptRef } from '../../services/ai-run.ts'
import { type IdeaMeasureService, isMeasurable } from '../../services/idea-measure.ts'
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
  measure: IdeaMeasureService
  // Its script, for the queue (005); the bank works without it.
  scriptOf?: (ideaId: string) => { id: string; status: ScriptStatus } | null
  youtube: { effectiveSource(): YouTubeSource }
  // The prices of the Data API in thresholds.json (`dataApi`), for the units of «Medir todas» (R2).
  dataApiUnits: { searchUnits: number; otherUnits: number }
  // `ideas.basis` of thresholds.json: the semaphore says it is an assumption, with its date.
  measureBasis: { label: string; date: string; recentDays: number; audienceViews: number }
  now?: () => Date
}

// How many ideas a batch asks for (contracts/ai-uses.md).
const BATCH_SIZE = 8
// How many titles of the similar videos the angles are written against (contracts/ai-uses.md).
const SIMILAR_TITLES = 12

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

  const contextOf = (profileVersion: number) => ({
    profileVersion,
    staleDays: deps.staleDays,
    now: now(),
    scriptOf: deps.scriptOf,
  })
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

  const measureJobs = (channelId: string) => jobs.listByChannel(channelId, 'medir_ideas')
  const runningJobOf = (channelId: string) => measureJobs(channelId).find((job) => job.status === 'en_curso') ?? null

  // What the last cut «Medir todas» left unmeasured, if a restart cut it short (contracts/http-api.md). A later
  // «¿Tiene hueco?» of one idea does not hide it: only a newer measure of each idea does.
  const interruptedOf = (channelId: string) => {
    const last = measureJobs(channelId).findLast((job) => job.status === 'interrumpido')
    if (!last) return null
    const left = (last.progress.ideaIds ?? []).filter((id) => {
      const idea = ideas.get(id)
      const latest = measures.latest(id)
      return idea && idea.status !== 'archivada' && (!latest || latest.measuredAt < last.startedAt)
    })
    return left.length > 0 ? { jobId: last.id, ideaIds: left } : null
  }

  routes.get('/channels/:id/ideas', (c) => {
    const { channel, profileVersion } = withProfile(c.req.param('id'))
    const pending = batches.pending(channel.id, 'ideas')
    const angles = batches.pendingAngles(channel.id)
    return c.json({
      ideas: viewsOf(channel.id, profileVersion, ideas.listBank(channel.id)),
      queue: ideas.listQueue(channel.id).map((idea) => idea.id),
      profileVersion,
      pendingBatch: pending ? batchView(pending) : null,
      pendingAngles: angles.map(batchView),
      runningJob: runningJobOf(channel.id)?.id ?? null,
      interrupted: interruptedOf(channel.id),
      measureBasis: {
        label: deps.measureBasis.label,
        date: deps.measureBasis.date,
        recentDays: deps.measureBasis.recentDays,
        audienceViews: deps.measureBasis.audienceViews,
      },
      // What measuring one idea spends with the Data API; null with yt-dlp (FR-007c).
      measureUnits:
        deps.youtube.effectiveSource() === 'data_api'
          ? {
              withoutEnglish: ideaMeasureUnits(deps.dataApiUnits, false),
              withEnglish: ideaMeasureUnits(deps.dataApiUnits, true),
            }
          : null,
    })
  })

  routes.get('/channels/:id/ideas/archived', (c) => {
    const { channel, profileVersion } = withProfile(c.req.param('id'))
    return c.json(viewsOf(channel.id, profileVersion, ideas.listArchived(channel.id)))
  })

  // US4: the order of the bank and of the queue. The body names every idea once, or nothing moves (FR-012).
  const ordered = <T>(move: () => T): T => {
    try {
      return move()
    } catch (error) {
      if (error instanceof IdeaOrderError) throw new ApiError({ code: 'validacion', fields: { ids: 'no_valido' } })
      throw error
    }
  }

  routes.put('/channels/:id/ideas/order', async (c) => {
    const { channel, profileVersion } = withProfile(c.req.param('id'))
    const { ids } = await parseBody(c, ideaOrderBodySchema)
    const list = ordered(() => ideas.reorder(channel.id, ids))
    return c.json({ ideas: viewsOf(channel.id, profileVersion, list) })
  })

  routes.put('/channels/:id/ideas/queue', async (c) => {
    const { channel } = withProfile(c.req.param('id'))
    const { ids } = await parseBody(c, ideaOrderBodySchema)
    const queue = ordered(() => ideas.reorderQueue(channel.id, ids))
    return c.json({ queue: queue.map((idea) => idea.id) })
  })

  // «Descargar como documento» and «Descargar como datos»: the bank without the archived ideas (data-model.md).
  routes.get('/channels/:id/ideas/export', (c) => {
    const { channel } = withProfile(c.req.param('id'))
    const query = exportQuerySchema.safeParse({ format: c.req.query('format') })
    if (!query.success) throw new ApiError({ code: 'validacion', fields: { format: 'no_valido' } })
    const { format } = query.data
    const latest = measures.latestByChannel(channel.id)
    const input = {
      exportedAt: now().toISOString(),
      channel: { id: channel.id, displayName: channel.displayName },
      ideas: ideas.listBank(channel.id).map((idea) => {
        const measure = latest.get(idea.id) ?? null
        if (!measure) return { idea, measure: null }
        const age = (now().getTime() - new Date(measure.measuredAt).getTime()) / 86_400_000
        return {
          idea,
          measure: { ...measure, olderRevision: measure.ideaRevision !== idea.revision, stale: age > deps.staleDays },
        }
      }),
    }
    return c.body(format === 'md' ? bankMarkdown(input) : `${JSON.stringify(bankJson(input), null, 2)}\n`, 200, {
      'Content-Type': format === 'md' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${bankFileName(channel.displayName, format)}"`,
    })
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

  // «Preparar la medida»: what the AI needs to write the three searches of one idea (contracts/ai-uses.md).
  const queriesInput = (idea: Idea, profile: ChannelProfile) => {
    const { niche, pillars } = profileInput(profile)
    return {
      idea: { title: idea.title, hook: idea.hook, pillar: idea.pillar, format: idea.format },
      profile: { niche, pillars },
    }
  }

  // «Buscar otro enfoque» only for an idea in the bank whose last measure, of this version of the idea, says
  // quemado or competido (FR-011, entry 51): an older measure would pair the new idea with other similar videos.
  const burntMeasureOf = (idea: Idea) => {
    const latest = measures.latest(idea.id)
    if (
      idea.status === 'archivada' ||
      latest?.status !== 'medida' ||
      latest.ideaRevision !== idea.revision ||
      (latest.verdict !== 'quemado' && latest.verdict !== 'competido')
    ) {
      throw new ApiError({ code: 'validacion', fields: { ideaId: 'sin_medida_quemada' } })
    }
    return latest
  }

  // What the AI gets to write the angles: the idea, what YouTube already has like it, and the profile (ai-uses.md).
  // `avoid` keeps the AI from writing again what the creator already has or saw (prompt v2, entry 52).
  const anglesInput = (idea: Idea, measure: IdeaMeasure, profile: ChannelProfile) => {
    const avoid = avoidList(ideas.listAll(idea.channelId), batches.list(idea.channelId))
    return {
      input: {
        idea: { title: idea.title, hook: idea.hook, pillar: idea.pillar, format: idea.format, query: idea.query },
        measure: {
          verdict: measure.verdict,
          similarTitles: measure.similarVideos.slice(0, SIMILAR_TITLES).map((video) => video.title),
        },
        profile: profileInput(profile),
        avoid: avoid.forAi,
      },
      avoidAll: avoid.all,
    }
  }

  // An idea named in a body must be one of this channel.
  const ideaOf = (channelId: string, ideaId: string | undefined) => {
    const idea = ideaId ? ideas.get(ideaId) : null
    if (!idea || idea.channelId !== channelId)
      throw new ApiError({ code: 'validacion', fields: { ideaId: 'no_valido' } })
    return idea
  }

  // What a use costs before asking for it (principle III).
  routes.post('/channels/:id/ideas/estimate', async (c) => {
    const { channel, profile } = withProfile(c.req.param('id'))
    const { use, ideaId } = await parseBody(c, ideaEstimateBodySchema)
    const journeyId = journeyOf(channel.id)
    if (use === 'ideas') return c.json(aiRun.estimate({ journeyId, use, input: ideasInput(channel.id, profile).input }))
    if (use === 'otro_enfoque') {
      const idea = ideaOf(channel.id, ideaId)
      return c.json(aiRun.estimate({ journeyId, use, input: anglesInput(idea, burntMeasureOf(idea), profile).input }))
    }
    if (use === 'busquedas_idea') {
      return c.json(aiRun.estimate({ journeyId, use, input: queriesInput(ideaOf(channel.id, ideaId), profile) }))
    }
    throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
  })

  // «Preparar la medida»: the AI writes the searches; the idea moves to a new revision (contracts/http-api.md).
  routes.post('/ideas/:id/queries', async (c) => {
    const { idea, profile, profileVersion } = findIdea(c.req.param('id'))
    const { estimateId, revision } = await parseBody(c, ideaQueriesBodySchema)
    const stale = () => {
      const current = ideas.get(idea.id)!
      if (current.revision !== revision) {
        throw new ApiError({ code: 'conflicto', current: viewOf(current, profileVersion) as never })
      }
    }
    stale()
    const result = await aiRun.run({
      estimateId,
      journeyId: journeyOf(idea.channelId),
      use: 'busquedas_idea',
      input: queriesInput(idea, profile),
    })
    if (!result.ok) return c.json({ failure: result.failure })
    // Changed in another tab while the AI wrote: what it wrote is not put over it.
    const changed = inTransaction(db, () => {
      stale()
      return ideas.edit(idea.id, result.value)!
    })
    return c.json(viewOf(changed, profileVersion))
  })

  // «Buscar otro enfoque»: 2 to 3 angles of a burnt or competed idea, waiting for the creator (US3).
  routes.post('/ideas/:id/angles', async (c) => {
    const { idea, profile, profileVersion } = findIdea(c.req.param('id'))
    const body = await parseBody(c, anglesBodySchema)
    // Checked before spending: the idea may have been measured again since the estimate.
    const { input, avoidAll } = anglesInput(idea, burntMeasureOf(idea), profile)
    const result = await aiRun.run({
      estimateId: body.estimateId,
      journeyId: journeyOf(idea.channelId),
      use: 'otro_enfoque',
      input,
      schema: anglesOutputFor(input.profile.pillars),
      ...(body.instructions ? { instructions: body.instructions } : {}),
    })
    if (!result.ok) return c.json({ failure: result.failure })
    const { kept, removed } = dropRepeats(result.value.angles, avoidAll)
    const drafts = kept.map((draft) => ({ ...draft, pillar: profilePillar(input.profile.pillars, draft.pillar) }))
    const prompt = deps.promptFor('otro_enfoque')
    const batch = inTransaction(db, () => {
      // Checked again: it may have been measured with room, changed or archived while the AI wrote (entry 51).
      burntMeasureOf(ideas.get(idea.id)!)
      // The angles of this idea still waiting are left, as a batch of ideas leaves the last one (entry 48).
      if (drafts.length > 0) batches.discardPending(idea.channelId, 'otro_enfoque', idea.id)
      return batches.create({
        channelId: idea.channelId,
        kind: 'otro_enfoque',
        sourceIdeaId: idea.id,
        payload: { angles: drafts },
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

  const ideasOfChannel = (channelId: string, ids: readonly string[]) =>
    ids.map((id) => ideas.get(id)).filter((idea): idea is Idea => idea?.channelId === channelId)

  // What «Medir todas» will do before doing it: how many, and the Data API units it spends (FR-007c).
  routes.post('/channels/:id/idea-measures/estimate', async (c) => {
    const { channel } = withProfile(c.req.param('id'))
    const { ideaIds } = await parseBody(c, measureEstimateBodySchema)
    const list = ideasOfChannel(channel.id, [...new Set(ideaIds)])
    const measurable = list.filter(isMeasurable)
    const units =
      deps.youtube.effectiveSource() === 'data_api'
        ? measurable.reduce((sum, idea) => sum + ideaMeasureUnits(deps.dataApiUnits, idea.queryEn !== null), 0)
        : null
    return c.json({
      ideas: list.length,
      measurable: measurable.length,
      withoutEnglish: measurable.filter((idea) => idea.queryEn === null).length,
      units,
    })
  })

  // «¿Tiene hueco?» and «Medir todas»: one job at a time per channel, or the quota would go twice.
  routes.post('/channels/:id/idea-measures', async (c) => {
    const { channel } = withProfile(c.req.param('id'))
    const body = await parseBody(c, ideaMeasuresBodySchema)
    // The same idea twice would spend its quota twice.
    const ideaIds = [...new Set(body.ideaIds)]
    const fresh = body.fresh
    const running = runningJobOf(channel.id)
    if (running) throw new ApiError({ code: 'conflicto', jobId: running.id })
    const list = ideasOfChannel(channel.id, ideaIds)
    if (list.length !== ideaIds.length) throw new ApiError({ code: 'no_encontrado' })
    // An archived idea is out of the bank: it is recovered before it is measured.
    if (list.some((idea) => idea.status === 'archivada'))
      throw new ApiError({ code: 'validacion', fields: { ideaIds: 'no_valido' } })
    const job = deps.measure.start(channel.id, ideaIds, { fresh: fresh === true })
    return c.json({ jobId: job.id }, 202)
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
