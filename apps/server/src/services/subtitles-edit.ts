import { randomUUID } from 'node:crypto'
import {
  type Cue,
  replaceAll,
  replaceCount,
  replacementsSchema,
  reviewBatches,
  reviewOutputFor,
  type SubtitleOrigin,
  type SubtitlesContent,
  subtitlesContentSchema,
} from '@ytcreator/core'
import type { SubtitlesReplaceBody, SubtitlesView, SubtitleUse, SubtitleVersionSummary } from '@ytcreator/core/api'
import type { JourneysRepo } from '../db/repos/journeys.ts'
import type { ScriptVersionsRepo } from '../db/repos/script-versions.ts'
import type { SubtitleTrack, SubtitleTracksRepo } from '../db/repos/subtitle-tracks.ts'
import type { SubtitleVersion, SubtitleVersionsRepo } from '../db/repos/subtitle-versions.ts'
import { ApiError } from '../http/errors.ts'
import type { AiRunService, Estimate, PromptRef } from './ai-run.ts'
import type { JobsService } from './jobs.ts'
import type { SubtitlesService } from './subtitles.ts'

export interface SubtitlesEditDeps {
  service: SubtitlesService
  tracks: SubtitleTracksRepo
  versions: SubtitleVersionsRepo
  scriptVersions: ScriptVersionsRepo
  journeys: JourneysRepo
  jobs: JobsService
  aiRun: AiRunService
  promptFor: (use: SubtitleUse) => PromptRef
  now: () => Date
}

// An estimate of every batch, asked together: the creator sees one cost and starts one review (R11).
interface BatchEstimate {
  scriptId: string
  version: number
  ids: string[]
  createdAt: number
}
// Longer than the estimates of ai-run last (ten minutes): an older one is refused there anyway.
const ESTIMATE_KEPT_MS = 60 * 60 * 1000

// What the creator changes in the subtitles, and the AI's review (specs/007-subtitles/contracts/http-api.md). Every
// change is a new whole version; none is ever lost (R12).
export function createSubtitlesEdit(deps: SubtitlesEditDeps) {
  const { service, tracks, versions, scriptVersions, aiRun } = deps
  const estimates = new Map<string, BatchEstimate>()

  // The track and its last version, ready to change from `baseVersion`.
  const current = (scriptId: string, baseVersion: number) => {
    const found = service.find(scriptId)
    const track = found.track
    const latest = track ? versions.latest(track.id) : null
    if (!track || !latest) throw new ApiError({ code: 'conflicto' })
    service.assertIdle(track)
    if (latest.version !== baseVersion) throw new ApiError({ code: 'version_cambiada' })
    return { ...found, track, latest }
  }

  // The content as its schema accepts it, or a 400: never a 500 for something the creator sent.
  const valid = (format: 'largo' | 'short', content: SubtitlesContent): SubtitlesContent => {
    const parsed = subtitlesContentSchema(format).safeParse(content)
    if (!parsed.success) throw new ApiError({ code: 'validacion', fields: { content: 'no_valido' } })
    return parsed.data
  }

  // A new version leaves behind what the AI proposed for the one before (R11).
  const addVersion = (
    track: SubtitleTrack,
    from: SubtitleVersion,
    origin: SubtitleOrigin,
    content: SubtitlesContent,
    extra: {
      restoredFrom?: number
      usageId?: string | null
      promptId?: string | null
      promptVersion?: number | null
    } = {},
  ) => {
    versions.add({ trackId: track.id, origin, content, draftVersion: from.draftVersion, ...extra })
    tracks.setAiProposal(track.id, null)
    tracks.touch(track.id)
  }

  /** What the creator wrote: their cues over the words and the length of the audio, which never change here. */
  const save = (scriptId: string, baseVersion: number, sent: unknown): SubtitlesView => {
    const { script, track, latest } = current(scriptId, baseVersion)
    const cues = (sent as { cues?: unknown } | null)?.cues
    if (!Array.isArray(cues)) throw new ApiError({ code: 'validacion', fields: { content: 'no_valido' } })
    const content = valid(script.format, {
      cues: cues as Cue[],
      words: latest.content.words,
      audioSeconds: latest.content.audioSeconds,
    })
    // Nothing changed: no version, so approved subtitles stay approved and a proposal stays (FR-013).
    if (JSON.stringify(content.cues) === JSON.stringify(latest.content.cues)) return service.view(scriptId)
    addVersion(track, latest, 'edicion', content)
    return service.view(scriptId)
  }

  /** «Cambiar en todos»: how many first, then the change, kept to apply it again to a new version (FR-009). */
  const replace = (scriptId: string, { baseVersion, from, to, dryRun }: SubtitlesReplaceBody) => {
    const { script, track, latest } = current(scriptId, baseVersion)
    if (dryRun) return { count: replaceCount(latest.content.cues, from) }
    const { cues, count } = replaceAll(latest.content.cues, from, to)
    if (count === 0) throw new ApiError({ code: 'validacion', fields: { from: 'no_valido' } })
    // The same text changed again replaces the one before: one correction per word. Checked before writing anything,
    // so a full list never leaves the subtitles changed and the correction lost.
    const kept = track.replacements.filter((one) => one.from !== from)
    const replacements = replacementsSchema.safeParse([...kept, { from, to }])
    if (!replacements.success) throw new ApiError({ code: 'validacion', fields: { from: 'lleno' } })
    const content = valid(script.format, { ...latest.content, cues })
    addVersion(track, latest, 'edicion', content)
    tracks.setReplacements(track.id, replacements.data)
    return service.view(scriptId)
  }

  /** «Volver a esta»: a copy as a new version; the ones after it stay in the history (FR-012). */
  const restore = (scriptId: string, baseVersion: number, version: number): SubtitlesView => {
    const { script, track } = current(scriptId, baseVersion)
    const old = versions.get(track.id, version)
    if (!old) throw new ApiError({ code: 'no_encontrado' })
    addVersion(track, old, 'recuperada', valid(script.format, old.content), { restoredFrom: old.version })
    return service.view(scriptId)
  }

  /** Approves the last version; any change after it makes them a draft again (data-model, «Estados»). */
  const approve = (scriptId: string, version: number): SubtitlesView => {
    const { track } = service.find(scriptId)
    const latest = track ? versions.latestNumber(track.id) : null
    if (!track || latest === null) throw new ApiError({ code: 'conflicto' })
    service.assertIdle(track)
    if (latest !== version) throw new ApiError({ code: 'version_cambiada' })
    tracks.approve(track.id, version)
    return service.view(scriptId)
  }

  const listVersions = (scriptId: string): SubtitleVersionSummary[] => {
    const { track } = service.find(scriptId)
    return track ? versions.summaries(track.id) : []
  }

  const readVersion = (scriptId: string, version: number) => {
    const { track } = service.find(scriptId)
    const found = track ? versions.get(track.id, version) : null
    if (!found) throw new ApiError({ code: 'no_encontrado' })
    return {
      version: found.version,
      origin: found.origin,
      createdAt: found.createdAt,
      draftVersion: found.draftVersion,
      restoredFrom: found.restoredFrom,
      content: found.content,
    }
  }

  const journeyOf = (channelId: string) => {
    const journey = deps.journeys.getLast(channelId)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    return journey.id
  }

  // What each batch is sent with: its cues without times, the approved script and the corrections already made.
  const requestFor = (scriptId: string) => {
    const { script, track, latest } = (() => {
      const found = service.find(scriptId)
      const latest = found.track ? versions.latest(found.track.id) : null
      if (!found.track || !latest || latest.content.cues.length === 0) throw new ApiError({ code: 'conflicto' })
      return { ...found, track: found.track, latest }
    })()
    const draft =
      script.draftApprovedVersion === null ? null : scriptVersions.get(script.id, 'guion', script.draftApprovedVersion)
    if (!draft) throw new ApiError({ code: 'sin_aprobar' })
    const blocks = draft.content.blocks.map((block) => ({ id: block.id, text: block.text }))
    const glossary = [...new Set(track.replacements.map((one) => one.to))]
    const maxLines = service.limitValues(script.format).maxLines
    const batches = reviewBatches(latest.content.cues).map((cues) => ({
      cues,
      input: { cues, script: { blocks }, glossary, maxLines } as Record<string, unknown>,
    }))
    return {
      script,
      track,
      latest,
      batches,
      scriptText: blocks.map((block) => block.text).join('\n\n'),
      maxLines,
      glossary,
      scope: (i: number) => `${track.id}/revision_ia/${latest.version}/${i}`,
    }
  }

  const reservedOf = (batches: readonly { input: Record<string, unknown> }[]) =>
    batches.reduce((sum, batch) => sum + aiRun.reservedFor('revision_subtitulos', batch.input), 0)

  const dropOld = () => {
    const now = deps.now().getTime()
    for (const [id, saved] of estimates) if (now - saved.createdAt > ESTIMATE_KEPT_MS) estimates.delete(id)
  }

  /** The cost of every batch, added up (R11). */
  const estimate = (scriptId: string, use: SubtitleUse): Estimate => {
    const { script, track, latest, batches, scope } = requestFor(scriptId)
    service.assertIdle(track)
    const journeyId = journeyOf(script.channelId)
    const each = batches.map((batch, i) => aiRun.estimate({ journeyId, use, input: batch.input, scope: scope(i) }))
    dropOld()
    const estimateId = randomUUID()
    estimates.set(estimateId, {
      scriptId,
      version: latest.version,
      ids: each.map((one) => one.estimateId),
      createdAt: deps.now().getTime(),
    })
    const first = each[0]!
    return {
      estimateId,
      use,
      cents: each.reduce((sum, one) => sum + one.cents, 0),
      included: each.every((one) => one.included),
      // The whole review is one operation: its limit and the day's and month's hold all the batches together.
      blockedBy: aiRun.blockFor(reservedOf(batches)) ?? each.find((one) => one.blockedBy !== null)?.blockedBy ?? null,
      maxCents: each.reduce((sum, one) => sum + one.maxCents, 0),
      pricingVersion: first.pricingVersion,
    }
  }

  // Runs in the background; on ending, the view has the proposal, never a version (R11). A batch that fails leaves
  // the subtitles as they were and no proposal: half a review would hide that the rest was never looked at.
  const generate = (scriptId: string, use: SubtitleUse, estimateId: string, baseVersion: number): string => {
    const { script, track, latest, batches, scriptText, maxLines, glossary, scope } = requestFor(scriptId)
    service.assertIdle(track)
    if (latest.version !== baseVersion) throw new ApiError({ code: 'version_cambiada' })
    const saved = estimates.get(estimateId)
    if (
      !saved ||
      saved.scriptId !== scriptId ||
      saved.version !== latest.version ||
      saved.ids.length !== batches.length
    )
      throw new ApiError({ code: 'validacion', fields: { estimateId: 'no_valido' } })
    const journeyId = journeyOf(script.channelId)
    saved.ids.forEach((id, i) => aiRun.assertEstimate(id, use, journeyId, scope(i)))
    estimates.delete(estimateId)
    const prompt = deps.promptFor(use)
    const job = deps.jobs.start({ journeyId: null, channelId: script.channelId, kind: 'ia' }, async (context) => {
      const changes: { cueId: string; text: string; reason: string }[] = []
      const usageIds: string[] = []
      // Checked again with every batch together, before paying for the first: the totals may have moved.
      if (aiRun.blockFor(reservedOf(batches))) return { failure: 'limite_de_gasto' }
      for (const [i, batch] of batches.entries()) {
        context.progress(i, batches.length)
        // An estimate lasts ten minutes, and a long video may take longer: each later batch asks for its own when it
        // starts, with the same input, so the last ones never find theirs expired after the first were paid.
        const estimateId =
          i === 0 ? saved.ids[0]! : aiRun.estimate({ journeyId, use, input: batch.input, scope: scope(i) }).estimateId
        const result = await aiRun.run({
          estimateId,
          journeyId,
          scope: scope(i),
          use,
          input: batch.input,
          schema: reviewOutputFor({ batch: batch.cues, script: scriptText, maxLines, glossary }),
        })
        if (!result.ok) return { failure: result.failure }
        usageIds.push(result.usageId)
        for (const change of result.value.changes)
          changes.push({ cueId: change.id, text: change.text.trim(), reason: change.reason.trim() })
      }
      context.progress(batches.length, batches.length)
      // Nothing changes while it runs (assertIdle), but a proposal is only ever for the version it read.
      if (versions.latestNumber(track.id) !== latest.version) return { failure: 'interrumpido' }
      tracks.setAiProposal(track.id, {
        baseVersion: latest.version,
        changes,
        usageIds,
        promptId: prompt.id,
        promptVersion: prompt.version,
      })
      return undefined
    })
    tracks.setJob(track.id, job.id, 'revision_ia')
    return job.id
  }

  /** The changes the creator accepts, as a version `ia` with the times as they were; `[]` discards the proposal. */
  const decide = (scriptId: string, baseVersion: number, accept: readonly string[]): SubtitlesView => {
    const { script, track, latest } = current(scriptId, baseVersion)
    const proposal = track.aiProposal
    if (!proposal || proposal.baseVersion !== latest.version) throw new ApiError({ code: 'conflicto' })
    const chosen = new Map(proposal.changes.map((change) => [change.cueId, change]))
    if (accept.some((id) => !chosen.has(id)))
      throw new ApiError({ code: 'validacion', fields: { accept: 'no_valido' } })
    if (accept.length === 0) {
      tracks.setAiProposal(track.id, null)
      return service.view(scriptId)
    }
    const accepted = new Set(accept)
    const cues = latest.content.cues.map((cue): Cue => {
      const change = accepted.has(cue.id) ? chosen.get(cue.id) : undefined
      if (!change) return cue
      return {
        ...cue,
        text: change.text,
        flags: cue.flags.includes('cambio_ia') ? cue.flags : [...cue.flags, 'cambio_ia'],
        // What was heard stays the first thing heard, to show beside it.
        heard: cue.heard ?? cue.text,
        reviewed: false,
      }
    })
    addVersion(track, latest, 'ia', valid(script.format, { ...latest.content, cues }), {
      usageId: proposal.usageIds[0] ?? null,
      promptId: proposal.promptId,
      promptVersion: proposal.promptVersion,
    })
    return service.view(scriptId)
  }

  return { save, replace, restore, approve, listVersions, readVersion, estimate, generate, decide }
}

export type SubtitlesEdit = ReturnType<typeof createSubtitlesEdit>
