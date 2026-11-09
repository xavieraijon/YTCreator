import {
  channelProfileSchema,
  DEFAULT_SCRIPT_SETTINGS,
  scriptStatus,
  scriptWarnings,
  type Idea,
  type ScriptKind,
} from '@ytcreator/core'
import type { ScriptSettingsView, ScriptSummary, ScriptVersionMeta, ScriptView } from '@ytcreator/core/api'
import type { DatabaseSync } from 'node:sqlite'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { IdeaMeasuresRepo } from '../db/repos/idea-measures.ts'
import type { IdeasRepo } from '../db/repos/ideas.ts'
import type { Job, JobsRepo } from '../db/repos/jobs.ts'
import type { JourneysRepo } from '../db/repos/journeys.ts'
import type { ProfilesRepo } from '../db/repos/profiles.ts'
import type { Script, ScriptsRepo } from '../db/repos/scripts.ts'
import type { ScriptVersion, ScriptVersionsRepo } from '../db/repos/script-versions.ts'
import type { JobsService } from './jobs.ts'
import { ApiError } from '../http/errors.ts'
import { SCRIPT_LIMITS, defaultTargetSeconds } from '@ytcreator/core'

export interface ScriptServiceDeps {
  db: DatabaseSync
  channels: ChannelsRepo
  profiles: ProfilesRepo
  journeys: JourneysRepo
  ideas: IdeasRepo
  measures: IdeaMeasuresRepo
  jobsRepo: JobsRepo
  jobs: JobsService
  scripts: ScriptsRepo
  versions: ScriptVersionsRepo
  // `maxDurationSeconds` of shorts.json: `core` does not depend on the knowledge package.
  shortMaxSeconds: number
  // Whether the active connection can search the web (R3).
  webResearch: () => boolean
  now?: () => Date
}

const LIVE = 'en_curso'

const metaOf = (version: ScriptVersion): ScriptVersionMeta => ({
  version: version.version,
  origin: version.origin,
  createdAt: version.createdAt,
  factsVersion: version.factsVersion,
  outlineVersion: version.outlineVersion,
  instructions: version.instructions,
  restoredFrom: version.restoredFrom,
})

const withContent = <K extends ScriptKind>(version: ScriptVersion<K> | null) =>
  version ? { ...metaOf(version as unknown as ScriptVersion), content: version.content } : null

// What every route of the script needs: reading it, and the rules on what it may do now.
export function createScriptService(deps: ScriptServiceDeps) {
  const { channels, profiles, ideas, measures, jobsRepo, scripts, versions, shortMaxSeconds } = deps

  const withProfile = (channelId: string) => {
    const channel = channels.get(channelId)
    if (!channel) throw new ApiError({ code: 'no_encontrado' })
    const current = profiles.getCurrent(channel.id)
    if (!current) throw new ApiError({ code: 'conflicto', fields: { profile: 'sin_perfil' } })
    return { channel, profile: channelProfileSchema.parse(current.profile), profileVersion: current.version }
  }

  const find = (id: string) => {
    const script = scripts.get(id)
    if (!script) throw new ApiError({ code: 'no_encontrado' })
    const idea = ideas.get(script.ideaId)
    if (!idea) throw new ApiError({ code: 'no_encontrado' })
    return { script, idea, ...withProfile(script.channelId) }
  }

  const jobOf = (script: Script): Job | null => (script.jobId ? jobsRepo.get(script.jobId) : null)

  // One job at a time, and nothing changes under it (R12).
  const assertIdle = (script: Script) => {
    const job = jobOf(script)
    if (job?.status === LIVE) throw new ApiError({ code: 'en_curso', jobId: job.id })
  }

  const statusOf = (script: Script) =>
    scriptStatus({
      format: script.format,
      latestOutline: versions.latestNumber(script.id, 'escaleta'),
      approvedOutline: script.outlineApprovedVersion,
      latestDraft: versions.latestNumber(script.id, 'guion'),
      approvedDraft: script.draftApprovedVersion,
    })

  const voiceOf = (channelId: string): ScriptSettingsView => {
    const saved = scripts.settings(channelId)
    return { ...(saved ?? DEFAULT_SCRIPT_SETTINGS), isDefault: saved === null }
  }

  const verdictOf = (idea: Idea) => {
    const latest = measures.latest(idea.id)
    return latest?.status === 'medida' && latest.ideaRevision === idea.revision ? latest.verdict : null
  }

  const view = (script: Script, idea: Idea, profileVersion: number): ScriptView => {
    const facts = versions.latest(script.id, 'hechos')
    const outline = versions.latest(script.id, 'escaleta')
    const draft = versions.latest(script.id, 'guion')
    const job = jobOf(script)
    const written = draft ?? outline
    const parent = script.sourceScriptId ? versions.latest(script.sourceScriptId, 'guion') : null
    return {
      id: script.id,
      channelId: script.channelId,
      ideaId: script.ideaId,
      format: script.format,
      targetSeconds: script.targetSeconds,
      notes: script.notes,
      updatedAt: script.updatedAt,
      status: statusOf(script),
      idea: {
        id: idea.id,
        title: idea.title,
        hook: idea.hook,
        query: idea.query,
        pillar: idea.pillar,
        format: idea.format,
        notes: idea.notes,
        status: idea.status,
        revision: idea.revision,
        verdict: verdictOf(idea),
      },
      facts: withContent(facts),
      outline: withContent(outline),
      draft: withContent(draft),
      outlineApprovedVersion: script.outlineApprovedVersion,
      draftApprovedVersion: script.draftApprovedVersion,
      draftApprovedAt: script.draftApprovedAt,
      draftApprovedPending: script.draftApprovedPending,
      warnings: scriptWarnings({
        ideaRevision: idea.revision,
        profileVersion,
        current: written
          ? {
              ideaRevision: written.ideaRevision,
              profileVersion: written.profileVersion,
              factsVersion: written.factsVersion,
            }
          : null,
        latestFacts: facts?.version ?? null,
        latestOutline: outline?.version ?? null,
        draftOutline: draft?.outlineVersion ?? null,
        source: script.sourceScriptId
          ? { latestDraft: parent?.version ?? null, usedDraft: script.sourceDraftVersion }
          : null,
      }),
      job: job && script.jobOp ? { id: job.id, op: script.jobOp, status: job.status, failure: job.failure } : null,
      webResearch: deps.webResearch(),
      limits: {
        minSeconds: script.format === 'largo' ? SCRIPT_LIMITS.longSeconds.min : SCRIPT_LIMITS.shortSeconds.min,
        maxSeconds: script.format === 'largo' ? SCRIPT_LIMITS.longSeconds.max : shortMaxSeconds,
      },
      voice: voiceOf(script.channelId),
    }
  }

  const summaries = (channelId: string): ScriptSummary[] =>
    scripts.listByChannel(channelId).map((script) => ({
      id: script.id,
      ideaId: script.ideaId,
      title: ideas.get(script.ideaId)?.title ?? '',
      format: script.format,
      status: statusOf(script),
      updatedAt: script.updatedAt,
    }))

  // An idea gets its script when it is chosen; one that already has it keeps it wherever it goes (data-model.md).
  const openForIdea = (ideaId: string) => {
    const idea = ideas.get(ideaId)
    if (!idea) throw new ApiError({ code: 'no_encontrado' })
    const { profileVersion } = withProfile(idea.channelId)
    const existing = scripts.getByIdea(idea.id)
    if (existing) return { view: view(existing, idea, profileVersion), created: false }
    if (idea.status !== 'elegida') throw new ApiError({ code: 'validacion', fields: { ideaId: 'no_valido' } })
    const script = scripts.create({
      channelId: idea.channelId,
      ideaId: idea.id,
      format: idea.format,
      targetSeconds: defaultTargetSeconds(idea.format),
    })
    return { view: view(script, idea, profileVersion), created: true }
  }

  return { withProfile, find, jobOf, assertIdle, statusOf, voiceOf, view, summaries, openForIdea, shortMaxSeconds }
}

export type ScriptService = ReturnType<typeof createScriptService>
