import { Hono } from 'hono'
import type { ChannelsRepo } from '../../db/repos/channels.ts'
import type { IdeaBatchesRepo } from '../../db/repos/idea-batches.ts'
import type { IdeaMeasuresRepo } from '../../db/repos/idea-measures.ts'
import type { IdeasRepo } from '../../db/repos/ideas.ts'
import type { JobsRepo } from '../../db/repos/jobs.ts'
import type { ProfilesRepo } from '../../db/repos/profiles.ts'
import { batchView, ideaView } from '../../services/ideas.ts'
import { ApiError } from '../errors.ts'

export interface IdeaRoutesDeps {
  channels: ChannelsRepo
  profiles: ProfilesRepo
  ideas: IdeasRepo
  batches: IdeaBatchesRepo
  measures: IdeaMeasuresRepo
  jobs: JobsRepo
  // `ideas.staleDays` of thresholds.json (FR-010).
  staleDays: number
  now?: () => Date
}

// The idea bank of a channel (specs/004-idea-bank/contracts/http-api.md).
export function ideaRoutes(deps: IdeaRoutesDeps) {
  const { channels, profiles, ideas, batches, measures, jobs } = deps
  const now = deps.now ?? (() => new Date())
  const routes = new Hono()

  // Every route of the bank needs a channel with its profile: the ideas are written for it (US1 AS5).
  const withProfile = (channelId: string) => {
    const channel = channels.get(channelId)
    if (!channel) throw new ApiError({ code: 'no_encontrado' })
    const profile = profiles.getCurrent(channel.id)
    if (!profile) throw new ApiError({ code: 'conflicto', fields: { profile: 'sin_perfil' } })
    return { channel, profileVersion: profile.version }
  }

  const viewsOf = (channelId: string, profileVersion: number, list: ReturnType<IdeasRepo['listBank']>) => {
    const latest = measures.latestByChannel(channelId)
    const context = { profileVersion, staleDays: deps.staleDays, now: now() }
    return list.map((idea) => ideaView(idea, latest.get(idea.id) ?? null, context))
  }

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

  return routes
}
