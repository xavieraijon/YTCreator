import { subtitlesStatus, type ScriptStatus } from '@ytcreator/core'
import type { SubtitlesView } from '@ytcreator/core/api'
import type { SubtitlesKnowledge } from '@ytcreator/knowledge'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { IdeasRepo } from '../db/repos/ideas.ts'
import type { JobsRepo } from '../db/repos/jobs.ts'
import type { ScriptsRepo } from '../db/repos/scripts.ts'
import type { SubtitleTrack, SubtitleTracksRepo } from '../db/repos/subtitle-tracks.ts'
import type { SubtitleVersionsRepo } from '../db/repos/subtitle-versions.ts'
import { ApiError } from '../http/errors.ts'

export interface SubtitlesServiceDeps {
  channels: ChannelsRepo
  ideas: IdeasRepo
  scripts: ScriptsRepo
  tracks: SubtitleTracksRepo
  versions: SubtitleVersionsRepo
  jobsRepo: JobsRepo
  /** The status of a script as 005 works it out. */
  scriptStatus: (ideaId: string) => ScriptStatus | null
  knowledge: SubtitlesKnowledge
}

// What every route of the subtitles needs: reading them (specs/007-subtitles/contracts/http-api.md).
export function createSubtitlesService(deps: SubtitlesServiceDeps) {
  const { channels, ideas, scripts, tracks, versions, jobsRepo, knowledge } = deps

  // A script that does not exist, or whose channel is gone, is not there for the creator.
  const find = (scriptId: string) => {
    const script = scripts.get(scriptId)
    if (!script) throw new ApiError({ code: 'no_encontrado' })
    if (!channels.get(script.channelId)) throw new ApiError({ code: 'no_encontrado' })
    const idea = ideas.get(script.ideaId)
    if (!idea) throw new ApiError({ code: 'no_encontrado' })
    return { script, idea, track: tracks.getByScript(script.id) }
  }

  // The reading limits of its format, each saying whether it is an assumption (principle V).
  const limitsOf = (format: 'largo' | 'short'): SubtitlesView['limits'] => {
    const figures = knowledge.craft.data[format === 'largo' ? 'long' : 'short']
    const figure = (one: (typeof figures)['maxLines']) => ({
      value: one.value,
      assumption: 'assumption' in one,
      source:
        'source' in one ? { label: knowledge.craft.source[one.source]!.label, date: knowledge.craft.reviewedAt } : null,
    })
    return {
      maxLines: figure(figures.maxLines),
      maxCharsPerLine: figure(figures.maxCharsPerLine),
      maxCharsPerSecond: figure(figures.maxCharsPerSecond),
      minSeconds: figure(figures.minSeconds),
      maxSeconds: figure(figures.maxSeconds),
      minGapSeconds: figure(figures.minGapSeconds),
    }
  }

  const jobOf = (track: SubtitleTrack | null) => {
    if (!track?.jobId || !track.jobOp) return null
    const job = jobsRepo.get(track.jobId)
    return job ? { job, op: track.jobOp } : null
  }

  const view = (scriptId: string): SubtitlesView => {
    const { script, idea, track } = find(scriptId)
    const latest = track ? versions.latest(track.id) : null
    const current = jobOf(track)
    const approvedDraft = script.draftApprovedVersion
    return {
      scriptId: script.id,
      channelId: script.channelId,
      format: script.format,
      idea: { id: idea.id, title: idea.title },
      script: { status: deps.scriptStatus(idea.id) ?? 'sin_empezar', approvedDraftVersion: approvedDraft },
      status: subtitlesStatus({
        latest: latest?.version ?? null,
        approved: track?.approvedVersion ?? null,
        // Only the recognition makes them «en marcha»; the AI's review does not (data-model.md, «Pista»).
        job: current?.op === 'reconocer' ? current.job.status : null,
      }),
      updatedAt: track?.updatedAt ?? null,
      latest: latest
        ? {
            version: latest.version,
            origin: latest.origin,
            createdAt: latest.createdAt,
            draftVersion: latest.draftVersion,
            restoredFrom: latest.restoredFrom,
            content: latest.content,
          }
        : null,
      // The reading marks are worked out in US1 (R10); until then, only what was kept with each cue.
      marks: {},
      toReview: latest ? latest.content.cues.filter((cue) => cue.flags.length > 0 && !cue.reviewed).length : 0,
      audio:
        track && track.audioSeconds !== null
          ? { available: track.audioFile !== null, seconds: track.audioSeconds, sourceName: track.sourceName }
          : null,
      approvedVersion: track?.approvedVersion ?? null,
      approvedAt: track?.approvedAt ?? null,
      scriptChanged:
        latest !== null &&
        latest.draftVersion !== null &&
        approvedDraft !== null &&
        latest.draftVersion !== approvedDraft,
      replacements: track?.replacements ?? [],
      limits: limitsOf(script.format),
      job: current
        ? {
            id: current.job.id,
            op: current.op,
            status: current.job.status,
            progress: { done: current.job.progress.done, total: current.job.progress.total },
            failure: current.job.failure,
            queuePosition: null,
          }
        : null,
      aiProposal: null,
    }
  }

  return { view }
}

export type SubtitlesService = ReturnType<typeof createSubtitlesService>
