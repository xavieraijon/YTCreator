import {
  type ChannelInfo,
  CHANNEL_VIDEOS_LIMIT,
  CHANNEL_HANDLE_PATTERN,
  type JourneyState,
  type Logger,
  type OwnBaselineSettings,
  rateVideos,
  safeThumbnail,
  summarizeReading,
  type VideoInfo,
  type YouTubeData,
  type YouTubeFailureCode,
  type YouTubeSource,
} from '@ytcreator/core'
import type { ResolvedChannel } from '@ytcreator/core/api'
import type { DatabaseSync } from 'node:sqlite'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { Job } from '../db/repos/jobs.ts'
import type { Journey, JourneysRepo } from '../db/repos/journeys.ts'
import type { ProposalsRepo } from '../db/repos/proposals.ts'
import type { ChannelReading, ReadingsRepo } from '../db/repos/readings.ts'
import { inTransaction } from '../db/transaction.ts'
import { ApiError } from '../http/errors.ts'
import type { JobsService } from './jobs.ts'

export interface ChannelReadingDeps {
  youtube: Pick<YouTubeData, 'resolve' | 'getChannel' | 'listChannelVideos'>
  channels: ChannelsRepo
  journeys: JourneysRepo
  proposals: ProposalsRepo
  readings: ReadingsRepo
  jobs: Pick<JobsService, 'start'>
  db: DatabaseSync
  thresholds: OwnBaselineSettings
  logger: Logger
  now: () => Date
}

export interface ChannelFound {
  channel: ResolvedChannel
  info: ChannelInfo
  source: YouTubeSource
}
export type LookUp = ({ ok: true } & ChannelFound) | { ok: false; failure: YouTubeFailureCode }

// A channel with no videos has nothing to list, which is an answer (US4 AS5). Any other failure is not one.
const NO_VIDEOS: readonly YouTubeFailureCode[] = ['sin_datos', 'no_encontrado']
const READING_STEPS = 2

/** What was read of the channel the journey is about: going back to another one, the old reading is no longer it. */
export function currentReading(journey: Journey, readings: Pick<ReadingsRepo, 'latestFor'>): ChannelReading | null {
  const { resolvedChannelId } = journey.state as JourneyState
  return resolvedChannelId ? readings.latestFor(journey.channelId, resolvedChannelId) : null
}

/** What the AI reads, inside <datos>: what the creator wrote and what YouTube says is information, never instructions. */
export function readingInput(
  use: 'lectura_canal' | 'posicionamiento',
  journey: Journey,
  readings: Pick<ReadingsRepo, 'latestFor'>,
  proposals: Pick<ProposalsRepo, 'latest'>,
  knowledge: unknown,
): Record<string, unknown> | null {
  const reading = currentReading(journey, readings)
  // With so little read, what is offered is the journey of a new channel (decisions.md, entry 61).
  if (!reading || reading.summary.lowInfo) return null
  const read = {
    channel: {
      title: reading.title,
      handle: reading.handle,
      description: reading.description,
      subscribers: reading.subscribers,
      videoCount: reading.videoCount,
    },
    summary: reading.summary,
    videos: reading.videos.map(({ id, ...video }) => ({ videoId: id, ...video })),
  }
  if (use === 'lectura_canal') return read
  const current = proposals.latest(journey.id, 'perfil_actual')
  const { audienceRegion, hoursPerWeek, onCamera } = journey.state as JourneyState
  // Asked for only with the profile approved and the answers given (entries 62 and 72): it would cost money otherwise.
  if (current?.status !== 'aprobada' || hoursPerWeek === undefined || onCamera === undefined) return null
  return {
    ...read,
    currentProfile: current.editedPayload ?? current.payload,
    audienceRegion,
    hoursPerWeek,
    onCamera,
    knowledge,
  }
}

// Reads an existing channel in the background (FR-019, FR-020): its figures are only worked out from what YouTube says.
export function createChannelReading(deps: ChannelReadingDeps) {
  const { youtube, channels, journeys, proposals, readings, jobs, db, thresholds, logger, now } = deps
  // The one running for each journey: a double click or a second tab follows it instead of reading twice.
  const running = new Map<string, { job: Job; youtubeChannelId: string }>()

  async function readVideos(
    job: { progress(done: number, total?: number): void },
    journey: Journey,
    { info, source }: Pick<ChannelFound, 'info' | 'source'>,
    { fresh = false, onRead }: { fresh?: boolean; onRead?: (reading: ChannelReading) => boolean } = {},
  ) {
    // Reading again what came out cut short: what was kept for a while would only say the same.
    const again = fresh || currentReading(journey, readings)?.summary.partial === true
    const listed = await youtube.listChannelVideos(info.channelId, {
      limit: CHANNEL_VIDEOS_LIMIT,
      withShorts: true,
      ...(again ? { fresh: true } : {}),
    })
    // Reading again a channel that had videos, «none» is more likely a failure than the truth: the figures before stay.
    if (!listed.ok && (fresh || !NO_VIDEOS.includes(listed.failure.code))) return { failure: listed.failure.code }
    job.progress(1, READING_STEPS)

    const videos: VideoInfo[] = listed.ok ? listed.value.data.slice(0, CHANNEL_VIDEOS_LIMIT) : []
    const rated = rateVideos(videos, thresholds)
    const summary = summarizeReading(rated, {
      settings: thresholds,
      now: now(),
      partial: listed.ok && listed.value.partial === true,
    })
    // Without its profile version, the new reading is not kept either: the creator can try again (entry 128).
    const notSaved = new Error('profile_not_saved')
    const save = () =>
      inTransaction(db, () => {
        const added = readings.add({
          channelId: journey.channelId,
          youtubeChannelId: info.channelId,
          source: listed.ok ? listed.value.source : source,
          title: info.title,
          handle: info.handle,
          description: info.description,
          subscribers: info.subscribers,
          videoCount: info.videoCount,
          videos: rated.map(({ videoId, ...video }) => ({ id: videoId, ...video })),
          summary,
          ...(listed.ok ? { fetchedAt: listed.value.fetchedAt } : {}),
        })
        // «Volver a leer» (entry 125): the profile version with the new figures, in the same transaction.
        if (onRead && !onRead(added)) throw notSaved
      })
    let saved = true
    try {
      save()
    } catch (error) {
      if (error !== notSaved) throw error
      saved = false
    }
    job.progress(READING_STEPS, READING_STEPS)
    return saved ? undefined : { failure: 'interno' }
  }

  return {
    async lookUp(input: string): Promise<LookUp> {
      const resolved = await youtube.resolve(input)
      if (!resolved.ok) return { ok: false, failure: resolved.failure.code }
      const channel = await youtube.getChannel(resolved.value.data)
      if (!channel.ok) return { ok: false, failure: channel.failure.code }
      const info = channel.value.data
      const { fetchedAt } = channel.value
      return {
        ok: true,
        info,
        source: channel.value.source,
        channel: {
          channelId: info.channelId,
          title: info.title,
          handle: info.handle,
          subscribers: info.subscribers,
          thumbnailUrl: safeThumbnail(info.thumbnailUrl),
          fetchedAt,
        },
      }
    },

    /** FR-028: a channel of YouTube belongs to one channel of the app. */
    isTaken(journey: Journey, youtubeChannelId: string): boolean {
      const owner = channels.findByYouTubeId(youtubeChannelId)
      return owner !== null && owner.id !== journey.channelId
    },

    start(journey: Journey, input: string, found: ChannelFound): Job {
      const { channel } = found
      const state = journey.state as JourneyState
      const already = running.get(journey.id)
      const followed = already?.youtubeChannelId === channel.channelId ? already.job : null
      // Reading it and already at its step: nothing to change.
      if (followed && journey.step === 'lectura') return followed

      const started = inTransaction(db, () => {
        // Another channel: what the AI said of the previous one is not about this one.
        if (state.resolvedChannelId && state.resolvedChannelId !== channel.channelId) {
          for (const stale of proposals.list(journey.id)) {
            if (stale.kind === 'perfil_actual' || stale.kind === 'posicionamiento') proposals.discard(stale.id)
          }
        }
        // Anything else is not an @ of YouTube: the channel goes on without it rather than failing (FR-019).
        const handle = channel.handle && CHANNEL_HANDLE_PATTERN.test(channel.handle) ? channel.handle : null
        // With no title, what it goes by is its @ (entry 81).
        const displayName = channel.title.trim().slice(0, 100) || handle
        channels.update(journey.channelId, {
          youtubeChannelId: channel.channelId,
          displayName,
          handle,
          nameStatus: displayName ? 'elegido' : 'provisional',
        })
        const next: JourneyState = { ...state, channelInput: input, resolvedChannelId: channel.channelId }
        // There is no answer to it in this journey: it follows what the channel has, España by default (FR-014b).
        next.audienceRegion = state.audienceRegion ?? channels.get(journey.channelId)?.audienceRegion ?? 'espana'
        const updated = journeys.update(journey.id, journey.revision, {
          state: next,
          ...(journey.step === 'confirmar' ? { step: 'lectura' as const } : {}),
        })
        // Inside the transaction: moved while looking the channel up, nothing of this stays.
        if (!updated?.ok) throw new ApiError({ code: 'conflicto', current: (updated?.current ?? journey) as never })
        return updated.journey
      })
      if (followed) return followed

      const job = jobs.start({ journeyId: journey.id, kind: 'leer_canal', total: READING_STEPS }, async (context) => {
        try {
          return await readVideos(context, started, found)
        } catch (error) {
          logger.error('channel_reading.failed', { error })
          return { failure: 'no_disponible' }
        } finally {
          if (running.get(journey.id)?.job.id === context.id) running.delete(journey.id)
        }
      })
      // The work only starts once this turn ends, so it cannot have finished yet.
      running.set(journey.id, { job, youtubeChannelId: channel.channelId })
      return job
    },

    // «Volver a leer tu canal» from the profile (entries 125 and P32): the same channel read again on YouTube, without
    // the AI, for figures of today. What was read before stays with the versions made from it. `onRead` makes the new
    // profile version; false if it could not, and then the job fails instead of saying it was saved.
    reread(journey: Journey, previous: ChannelReading, onRead: (reading: ChannelReading) => boolean): Job | null {
      if (running.has(journey.id)) return null
      const job = jobs.start({ journeyId: journey.id, kind: 'leer_canal', total: READING_STEPS }, async (context) => {
        try {
          const channel = await youtube.getChannel({ channelId: previous.youtubeChannelId })
          if (!channel.ok) return { failure: channel.failure.code }
          return await readVideos(
            context,
            journey,
            { info: channel.value.data, source: channel.value.source },
            { fresh: true, onRead },
          )
        } catch (error) {
          logger.error('channel_reading.failed', { error })
          return { failure: 'no_disponible' }
        } finally {
          if (running.get(journey.id)?.job.id === context.id) running.delete(journey.id)
        }
      })
      running.set(journey.id, { job, youtubeChannelId: previous.youtubeChannelId })
      return job
    },
  }
}

export type ChannelReadingService = ReturnType<typeof createChannelReading>
