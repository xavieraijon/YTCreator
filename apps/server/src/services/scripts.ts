import { randomUUID } from 'node:crypto'
import {
  channelProfileSchema,
  DEFAULT_SCRIPT_SETTINGS,
  defaultTargetSeconds,
  SCRIPT_LIMITS,
  scriptStatus,
  scriptWarnings,
  type ChannelProfile,
  type ContentOf,
  type Idea,
  type OutlineContent,
  type ScriptKind,
  type ScriptUse,
  type VersionOrigin,
} from '@ytcreator/core'
import type {
  OutlineSaveBody,
  ScriptGenerateBody,
  ScriptSettingsView,
  ScriptSummary,
  ScriptVersionMeta,
  ScriptView,
} from '@ytcreator/core/api'
import type { ScriptKnowledge } from '@ytcreator/knowledge'
import type { DatabaseSync } from 'node:sqlite'
import type { ChannelsRepo } from '../db/repos/channels.ts'
import type { IdeaMeasuresRepo } from '../db/repos/idea-measures.ts'
import type { IdeasRepo } from '../db/repos/ideas.ts'
import type { Job, JobsRepo } from '../db/repos/jobs.ts'
import type { JourneysRepo } from '../db/repos/journeys.ts'
import type { ProfilesRepo } from '../db/repos/profiles.ts'
import type { Script, ScriptsRepo } from '../db/repos/scripts.ts'
import type { ScriptVersion, ScriptVersionsRepo } from '../db/repos/script-versions.ts'
import type { AiRunService, PromptRef } from './ai-run.ts'
import { profileInput } from './ideas.ts'
import type { JobsService } from './jobs.ts'
import { ApiError } from '../http/errors.ts'

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
  aiRun: AiRunService
  promptFor: (use: ScriptUse) => PromptRef
  knowledge: ScriptKnowledge
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
  const { channels, profiles, journeys, ideas, measures, jobsRepo, scripts, versions, shortMaxSeconds, aiRun } = deps

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
      outlineFromAi: outline !== null && versions.list(script.id, 'escaleta').some((one) => one.origin === 'ia'),
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

  // The spending is written down on the channel's journey, as in the idea bank.
  const journeyOf = (channelId: string) => {
    const journey = journeys.getLast(channelId)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    return journey.id
  }

  type Found = ReturnType<typeof find>

  const addVersion = <K extends ScriptKind>(
    { script, idea, profileVersion }: Found,
    kind: K,
    origin: VersionOrigin,
    content: ContentOf<K>,
    extra: {
      factsVersion?: number | null
      outlineVersion?: number | null
      instructions?: string | null
      promptId?: string
      promptVersion?: number
      usageId?: string | null
      restoredFrom?: number
    } = {},
  ) => {
    const version = versions.add({
      scriptId: script.id,
      kind,
      origin,
      content,
      ideaRevision: idea.revision,
      profileVersion,
      ...extra,
    })
    scripts.touch(script.id)
    return version
  }

  const assertBase = (latest: number | null, baseVersion: number) => {
    if ((latest ?? 0) !== baseVersion) throw new ApiError({ code: 'version_cambiada' })
  }

  // The facts as the AI reads them: what is known, how sure it is and where it comes from.
  const factsInput = (scriptId: string) => {
    const facts = versions.latest(scriptId, 'hechos')
    return (facts?.content.facts ?? []).map((fact) => ({
      id: fact.id,
      text: fact.text,
      label: fact.label,
      sources: fact.sources.map((source) => source.title || source.reference || source.url),
    }))
  }

  const ideaInput = (idea: Idea) => ({ title: idea.title, hook: idea.hook, query: idea.query, format: idea.format })

  const outlineInput = ({ script, idea, profile }: { script: Script; idea: Idea; profile: ChannelProfile }) => ({
    idea: ideaInput(idea),
    profile: profileInput(profile),
    notes: script.notes,
    facts: factsInput(script.id),
    targetSeconds: script.targetSeconds,
    wordsPerMinute: voiceOf(script.channelId).wordsPerMinute,
    craft: deps.knowledge.craft.data,
    previous: versions.latest(script.id, 'escaleta')?.content ?? null,
  })

  // What each use asks for and what it does with the answer.
  const requestFor = (found: Found, use: ScriptUse) => {
    if (found.script.format === 'short') throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
    return {
      input: outlineInput(found),
      outputTokens: undefined,
      keep: (value: unknown, usageId: string | null, instructions: string | null) => {
        const { blocks } = value as { blocks: Omit<OutlineContent['blocks'][number], 'id'>[] }
        const prompt = deps.promptFor(use)
        addVersion(
          found,
          'escaleta',
          'ia',
          { blocks: blocks.map((block) => ({ ...block, id: randomUUID() })) },
          {
            factsVersion: versions.latestNumber(found.script.id, 'hechos'),
            instructions,
            promptId: prompt.id,
            promptVersion: prompt.version,
            usageId,
          },
        )
      },
    }
  }

  const estimate = (id: string, use: ScriptUse) => {
    const found = find(id)
    const { input, outputTokens } = requestFor(found, use)
    return aiRun.estimate({ journeyId: journeyOf(found.script.channelId), use, input, outputTokens })
  }

  // Runs in the background: the creator can close the tab and find the result on coming back (R12).
  const generate = (id: string, { use, estimateId, instructions }: ScriptGenerateBody) => {
    const found = find(id)
    assertIdle(found.script)
    const journeyId = journeyOf(found.script.channelId)
    aiRun.assertEstimate(estimateId, use, journeyId)
    const { input, keep } = requestFor(found, use)
    const job = deps.jobs.start({ journeyId: null, channelId: found.script.channelId, kind: 'ia' }, async () => {
      const result = await aiRun.run({ estimateId, journeyId, use, input, instructions })
      if (!result.ok) return { failure: result.failure }
      keep(result.value, result.usageId, instructions ?? null)
      return undefined
    })
    scripts.setJob(found.script.id, job.id, use)
    return job.id
  }

  const saveOutline = (id: string, { baseVersion, content }: OutlineSaveBody) => {
    const found = find(id)
    assertIdle(found.script)
    if (found.script.format === 'short') throw new ApiError({ code: 'validacion', fields: { outline: 'no_valido' } })
    const latest = versions.latest(found.script.id, 'escaleta')
    assertBase(latest?.version ?? null, baseVersion)
    addVersion(found, 'escaleta', 'edicion', content, { factsVersion: latest?.factsVersion ?? null })
    return view(scripts.get(id)!, found.idea, found.profileVersion)
  }

  const approveOutline = (id: string, version: number) => {
    const found = find(id)
    assertIdle(found.script)
    const latest = versions.latest(found.script.id, 'escaleta')
    if (!latest || latest.version !== version) throw new ApiError({ code: 'version_cambiada' })
    if (latest.content.blocks.some((block) => block.title.trim() === '')) {
      throw new ApiError({ code: 'validacion', fields: { blocks: 'no_valido' } })
    }
    return view(scripts.approveOutline(id, version), found.idea, found.profileVersion)
  }

  return {
    withProfile,
    find,
    assertIdle,
    view,
    summaries,
    openForIdea,
    shortMaxSeconds,
    estimate,
    generate,
    saveOutline,
    approveOutline,
    ideaScript(ideaId: string): { id: string; status: ReturnType<typeof statusOf> } | null {
      const script = scripts.getByIdea(ideaId)
      return script ? { id: script.id, status: statusOf(script) } : null
    },
  }
}

export type ScriptService = ReturnType<typeof createScriptService>
