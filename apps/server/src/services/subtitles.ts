import {
  countToReview,
  cueMarks,
  channelSubtitlesFileName,
  exportSubtitles,
  heardLittle,
  reapply,
  type ScriptStatus,
  type SubtitleLimits,
  subtitlesContentSchema,
  subtitlesFileName,
  subtitlesStatus,
} from '@ytcreator/core'
import type { SubtitleExportFormat, SubtitlesView } from '@ytcreator/core/api'
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
  /** The main title of the script's publishing package (006), to name the file; null without one. */
  mainTitle?: (scriptId: string) => string | null
  /** The publishing package of the script (006), for the real minutes of its chapters; null without one. */
  packageId?: (scriptId: string) => string | null
  /** Where a waiting recognition is in the queue (1 is next). */
  queuePosition?: (jobId: string) => number | null
  /** Whether a new audio waits, not heard yet (US5): it can be deleted too. */
  newAudio?: (scriptId: string) => boolean
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

  const valuesOf = (limits: SubtitlesView['limits']): SubtitleLimits => ({
    maxLines: limits.maxLines.value,
    maxCharsPerLine: limits.maxCharsPerLine.value,
    maxCharsPerSecond: limits.maxCharsPerSecond.value,
    minSeconds: limits.minSeconds.value,
    maxSeconds: limits.maxSeconds.value,
    minGapSeconds: limits.minGapSeconds.value,
  })

  const jobOf = (track: SubtitleTrack | null) => {
    if (!track?.jobId || !track.jobOp) return null
    const job = jobsRepo.get(track.jobId)
    return job ? { job, op: track.jobOp } : null
  }

  // After another file is heard (a recognition that is not the first), the changes made in all of them are offered
  // again until they are made again, whatever is changed meanwhile, if any subtitle would change and the result is
  // valid (FR-017, decision 54).
  const reapplyOffer = (
    track: SubtitleTrack | null,
    latest: ReturnType<SubtitleVersionsRepo['latest']>,
    format: 'largo' | 'short',
  ): SubtitlesView['reapply'] => {
    if (!track || !latest || track.replacements.length === 0) return null
    const since: string[] = []
    for (const one of versions.summaries(track.id)) {
      if (one.origin === 'reconocimiento') {
        // The first recognition has nothing before it to bring changes from.
        if (one.version === 1 || since.includes('reaplicada')) return null
        const { cues, count } = reapply(latest.content.cues, track.replacements)
        if (count === 0 || !subtitlesContentSchema(format).safeParse({ ...latest.content, cues }).success) return null
        return { corrections: track.replacements.length, count }
      }
      since.push(one.origin)
    }
    return null
  }

  const view = (scriptId: string): SubtitlesView => {
    const { script, idea, track } = find(scriptId)
    const latest = track ? versions.latest(track.id) : null
    const current = jobOf(track)
    const approvedDraft = script.draftApprovedVersion
    const limits = limitsOf(script.format)
    const cues = latest?.content.cues ?? []
    const marks = cueMarks(cues, valuesOf(limits))
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
      // Worked out every time, never kept (R10).
      marks,
      toReview: countToReview(cues, marks),
      // Only while it is true that all of them were marked: the threshold can change with the knowledge package.
      heardLittle:
        latest !== null &&
        cues.length > 0 &&
        cues.every((cue) => cue.flags.includes('poca_seguridad')) &&
        heardLittle(latest.content.words, latest.content.audioSeconds, {
          lowConfidence: knowledge.craft.data.lowConfidence.value,
          ...knowledge.craft.data.heardLittle,
        }),
      audio:
        track && track.audioSeconds !== null
          ? {
              available: track.audioFile !== null,
              seconds: track.audioSeconds,
              sourceName: track.sourceName,
            }
          : null,
      newAudio: deps.newAudio?.(script.id) ?? false,
      approvedVersion: track?.approvedVersion ?? null,
      approvedAt: track?.approvedAt ?? null,
      scriptChanged:
        latest !== null &&
        latest.draftVersion !== null &&
        approvedDraft !== null &&
        latest.draftVersion !== approvedDraft,
      replacements: track?.replacements ?? [],
      reapply: reapplyOffer(track, latest, script.format),
      limits,
      job: current
        ? {
            id: current.job.id,
            op: current.op,
            status: current.job.status,
            progress: { done: current.job.progress.done, total: current.job.progress.total },
            failure: current.job.failure,
            queuePosition: current.job.status === 'en_cola' ? (deps.queuePosition?.(current.job.id) ?? null) : null,
            finishedAt: current.job.finishedAt,
          }
        : null,
      // Only the one for the last version: any change after it leaves it behind (R11).
      aiProposal:
        track?.aiProposal && latest && track.aiProposal.baseVersion === latest.version
          ? track.aiProposal.changes
          : null,
      packageId: deps.packageId?.(script.id) ?? null,
    }
  }

  /** The file of the last version, named after the video (R14); 404 without subtitles. */
  const exportFile = (scriptId: string, format: SubtitleExportFormat) => {
    const { script, idea, track } = find(scriptId)
    const latest = track ? versions.latest(track.id) : null
    if (!latest) throw new ApiError({ code: 'no_encontrado' })
    return {
      text: exportSubtitles(latest.content.cues, format),
      fileName: subtitlesFileName(deps.mainTitle?.(script.id) ?? null, idea.title, format),
    }
  }

  /**
   * The subtitles of every script of the channel, for its data export (R17, FR-020): each with all its versions and
   * the SRT of the last one, so they can be read without the app. Never the audio, nor the words heard.
   */
  const exportChannel = (channelId: string) => {
    const channel = channels.get(channelId)
    if (!channel) throw new ApiError({ code: 'no_encontrado' })
    const items = scripts.listByChannel(channel.id).flatMap((script) => {
      const track = tracks.getByScript(script.id)
      const idea = ideas.get(script.ideaId)
      if (!track || !idea) return []
      // Oldest first; a row that no longer reads is left out rather than stopping the export of the others.
      const all = versions
        .summaries(track.id)
        .reverse()
        .flatMap(({ version }) => {
          try {
            const one = versions.get(track.id, version)
            return one ? [one] : []
          } catch {
            return []
          }
        })
      const last = all.at(-1)
      if (!last) return []
      return [
        {
          scriptId: script.id,
          idea: idea.title,
          mainTitle: deps.mainTitle?.(script.id) ?? null,
          format: script.format,
          approvedVersion: track.approvedVersion,
          approvedAt: track.approvedAt,
          srt: exportSubtitles(last.content.cues, 'srt'),
          versions: all.map((one) => ({
            version: one.version,
            origin: one.origin,
            createdAt: one.createdAt,
            restoredFrom: one.restoredFrom,
            draftVersion: one.draftVersion,
            audioSeconds: one.content.audioSeconds,
            cues: one.content.cues,
          })),
        },
      ]
    })
    return {
      fileName: channelSubtitlesFileName(channel.displayName),
      data: {
        exportedAt: new Date().toISOString(),
        channel: { id: channel.id, displayName: channel.displayName },
        subtitles: items,
      },
    }
  }

  /** For the view of the script (005): null until the creator starts its subtitles. */
  const statusOf = (scriptId: string): { status: SubtitlesView['status'] } | null => {
    const track = tracks.getByScript(scriptId)
    if (!track) return null
    const latest = versions.latestNumber(track.id)
    const current = jobOf(track)
    const status = subtitlesStatus({
      latest,
      approved: track.approvedVersion,
      job: current?.op === 'reconocer' ? current.job.status : null,
    })
    return { status }
  }

  /** A change waits while the track is busy: listening, or the AI reviewing it (as in 006). */
  const assertIdle = (track: SubtitleTrack) => {
    const current = jobOf(track)
    if (current && (current.job.status === 'en_curso' || current.job.status === 'en_cola'))
      throw new ApiError({ code: 'en_curso', jobId: current.job.id })
  }

  const limitValues = (format: 'largo' | 'short'): SubtitleLimits => valuesOf(limitsOf(format))

  return { view, reapplyOffer, exportFile, exportChannel, statusOf, find, assertIdle, limitValues }
}

export type SubtitlesService = ReturnType<typeof createSubtitlesService>
