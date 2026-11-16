import { randomUUID } from 'node:crypto'
import {
  channelProfileSchema,
  backingDomains,
  blockOutput,
  checkOutputFor,
  liveShortAngles,
  shortAnglesOutputFor,
  storedShortAnglesSchema,
  type StoredShortAngle,
  factLabel,
  seenSources,
  scriptSourceSchema,
  DEFAULT_SCRIPT_SETTINGS,
  defaultTargetSeconds,
  detectClaims,
  draftOutputFor,
  compareItems,
  orderChanged,
  comparableItems,
  shortDraftOutputFor,
  type ShortDraftOutput,
  durationSeconds,
  replaceFragment,
  withoutFragment,
  expectedOutputTokens,
  SCRIPT_LIMITS,
  scriptStatus,
  scriptWarnings,
  settleOrphans,
  type BlockOutput,
  type CheckOutput,
  type ShortAnglesOutput,
  type Fact,
  type LinkState,
  type ResearchOutput,
  type ScriptSource,
  type ChannelProfile,
  type Claim,
  type ContentOf,
  needsSearch,
  type DraftContent,
  type DraftOutput,
  type Idea,
  type OutlineContent,
  type ScriptExportItem,
  type ScriptKind,
  type ScriptUse,
  type VersionOrigin,
} from '@ytcreator/core'
import type {
  ClaimActionBody,
  DraftSaveBody,
  FactsSaveBody,
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
import type { LinkCheck } from './link-check.ts'
import { profileInput } from './ideas.ts'
import type { JobsService } from './jobs.ts'
import { inTransaction } from '../db/transaction.ts'
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
  // When shorts.json was reviewed: the maximum is shown with its date (principle V).
  shortsReviewedAt: string
  // Whether the active connection can search the web (R3).
  webResearch: () => boolean
  links: Pick<LinkCheck, 'checkAll'>
  now: () => Date
  aiRun: AiRunService
  promptFor: (use: ScriptUse) => PromptRef
  knowledge: ScriptKnowledge
  /** The publishing package of a script (006); bound late, since the package service reads the scripts. */
  packageOf?: (scriptId: string) => ScriptView['package']
  /** The state of its subtitles (007); bound late as well. */
  subtitlesOf?: (scriptId: string) => ScriptView['subtitles']
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

  // The outline the script was written from counts as unchanged while its blocks are the same: going back to it, or
  // saving it as it was, makes a new version but says nothing new (novice audit of 005, decision 51).
  const outlineSaidChanged = (
    scriptId: string,
    outline: ReturnType<typeof versions.latest<'escaleta'>>,
    usedVersion: number | null,
  ): number | null => {
    if (!outline || usedVersion === null || outline.version <= usedVersion) return outline?.version ?? null
    const used = versions.get(scriptId, 'escaleta', usedVersion)
    return used && JSON.stringify(used.content.blocks) === JSON.stringify(outline.content.blocks)
      ? usedVersion
      : outline.version
  }

  const verdictOf = (idea: Idea) => {
    const latest = measures.latest(idea.id)
    return latest?.status === 'medida' && latest.ideaRevision === idea.revision ? latest : null
  }

  // Already paid for: all of them are kept as they were, also one that no longer reads (decision 41).
  const keptAngles = (script: Script): unknown[] => (Array.isArray(script.shortAngles) ? [...script.shortAngles] : [])
  const storedAngles = (script: Script): (StoredShortAngle | null)[] =>
    keptAngles(script).map((one) => {
      const parsed = storedShortAnglesSchema.element.safeParse(one)
      return parsed.success ? parsed.data : null
    })

  // The approved long script: what a Short is drawn from and checked against (FR-019, decision 44).
  const approvedVersionOf = (scriptId: string) => scripts.get(scriptId)?.draftApprovedVersion ?? null

  // Offered only while the approved script says what they were drawn from (decision 41).
  const anglesOf = (script: Script) => {
    const draft = versions.latest(script.id, 'guion')
    if (!draft || draft.version !== script.draftApprovedVersion) return []
    return liveShortAngles(storedAngles(script), draft.content.blocks)
  }

  // The text of the moment a Short comes from, in one draft of the long script.
  const momentIn = (scriptId: string, blockId: string | null, version: number | null): string | null => {
    if (version === null) return null
    const draft = versions.get(scriptId, 'guion', version)
    return draft?.content.blocks.find((block) => block.id === blockId)?.text ?? null
  }

  const view = (script: Script, idea: Idea, profileVersion: number): ScriptView => {
    const facts = versions.latest(script.id, 'hechos')
    const outline = versions.latest(script.id, 'escaleta')
    const draft = versions.latest(script.id, 'guion')
    const job = jobOf(script)
    const written = draft ?? outline
    const parentScript = script.sourceScriptId ? scripts.get(script.sourceScriptId) : null
    const linked = (other: Script) => ({ id: other.id, title: ideas.get(other.ideaId)?.title ?? '' })
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
        verdict: verdictOf(idea)?.verdict ?? null,
        verdictAt: verdictOf(idea)?.measuredAt ?? null,
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
        latestOutline: outlineSaidChanged(script.id, outline, draft?.outlineVersion ?? null),
        draftOutline: draft?.outlineVersion ?? null,
        source: script.sourceScriptId
          ? {
              usedMoment: momentIn(script.sourceScriptId, script.sourceBlockId, script.sourceDraftVersion),
              latestMoment: momentIn(
                script.sourceScriptId,
                script.sourceBlockId,
                approvedVersionOf(script.sourceScriptId),
              ),
            }
          : null,
      }),
      job: job && script.jobOp ? { id: job.id, op: script.jobOp, status: job.status, failure: job.failure } : null,
      shortAngles: anglesOf(script),
      links: {
        // A moment that is gone cannot be written from again: the screen does not offer it (decision 44).
        parent: parentScript
          ? {
              ...linked(parentScript),
              momentGone: momentIn(parentScript.id, script.sourceBlockId, parentScript.draftApprovedVersion) === null,
            }
          : null,
        shorts: scripts.listBySource(script.id).map(linked),
      },
      webResearch: deps.webResearch(),
      limits: {
        minSeconds: script.format === 'largo' ? SCRIPT_LIMITS.longSeconds.min : SCRIPT_LIMITS.shortSeconds.min,
        maxSeconds: script.format === 'largo' ? SCRIPT_LIMITS.longSeconds.max : shortMaxSeconds,
        maxReviewedAt: script.format === 'largo' ? null : deps.shortsReviewedAt,
      },
      voice: voiceOf(script.channelId),
      package: deps.packageOf?.(script.id) ?? null,
      subtitles: deps.subtitlesOf?.(script.id) ?? null,
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
      // What is copied from an earlier version keeps saying what it was written with (data-model.md, «Avisos»).
      writtenWith?: { ideaRevision: number; profileVersion: number }
    } = {},
  ) => {
    const { writtenWith: earlier, ...rest } = extra
    const version = versions.add({
      scriptId: script.id,
      kind,
      origin,
      content,
      ideaRevision: earlier?.ideaRevision ?? idea.revision,
      profileVersion: earlier?.profileVersion ?? profileVersion,
      ...rest,
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
      alternatives: fact.alternatives,
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

  const writtenWith = ({ ideaRevision, profileVersion }: ScriptVersion<'guion'>) => ({ ideaRevision, profileVersion })

  const voiceInput = (channelId: string) => {
    const { address, register, sample } = voiceOf(channelId)
    return { address, register, sample }
  }

  // What the creator has said: nothing in it gets marked (R9).
  // The title and the hook of a Short drawn from a long video were written by the AI, so they do not count.
  const knownOf = ({ script, idea }: { script: Script; idea: Idea }) => [
    script.notes,
    ...(script.sourceScriptId ? [] : [idea.title, idea.hook]),
    idea.query ?? '',
    idea.notes,
  ]

  const claimsFor = (
    found: Found,
    blocks: readonly { id: string; text: string }[],
    aiClaims: readonly { blockId: string; text: string; factId: string | null }[],
  ) =>
    detectClaims({
      blocks,
      known: knownOf(found),
      facts: versions.latest(found.script.id, 'hechos')?.content.facts ?? [],
      aiClaims,
      newId: randomUUID,
    })

  // A script is written from the outline as it was approved, never from one still being changed (data-model.md).
  const approvedOutline = (script: Script) => {
    const outline = versions.latest(script.id, 'escaleta')
    if (!outline || outline.version !== script.outlineApprovedVersion) throw new ApiError({ code: 'sin_aprobar' })
    return outline
  }

  const approvedDraft = (script: Script) => {
    const draft = versions.latest(script.id, 'guion')
    if (!draft || draft.version !== script.draftApprovedVersion) throw new ApiError({ code: 'sin_aprobar' })
    return draft
  }

  // The moment of the long video a Short comes from, for whoever writes it (contracts/ai-uses.md): as the approved long
  // script says it now, if it still has it; if not, as it was. Writing from it is what clears `origen_cambiado`.
  const angleOf = ({ script, idea }: Found) => {
    if (!script.sourceScriptId || script.sourceDraftVersion === null) return null
    const approved = approvedVersionOf(script.sourceScriptId)
    const now = momentIn(script.sourceScriptId, script.sourceBlockId, approved)
    const version = now === null ? script.sourceDraftVersion : approved!
    const moment = now ?? momentIn(script.sourceScriptId, script.sourceBlockId, script.sourceDraftVersion)
    return moment === null ? null : { title: idea.title, hook: idea.hook, moment, version }
  }

  const blockRequest = (found: Found, blockId: string | undefined) => {
    const draft = versions.latest(found.script.id, 'guion')
    const index = draft?.content.blocks.findIndex((one) => one.id === blockId) ?? -1
    if (!draft || index === -1) throw new ApiError({ code: 'no_encontrado' })
    const { blocks } = draft.content
    const block = blocks[index]!
    // The outline this script was written from: one being changed has not been approved by anybody.
    const planned =
      draft.outlineVersion === null
        ? undefined
        : versions
            .get(found.script.id, 'escaleta', draft.outlineVersion)
            ?.content.blocks.find((one) => one.id === block.id)
    const { wordsPerMinute } = voiceOf(found.script.channelId)
    // A Short has no outline: the part fills what the other two leave of the duration it was asked to last.
    const others = durationSeconds(
      blocks
        .filter((one) => one.id !== block.id)
        .map((one) => one.text)
        .join(' '),
      wordsPerMinute,
    )
    const room = found.script.targetSeconds - others
    const shortSeconds = room > 0 ? room : Math.round(found.script.targetSeconds / blocks.length)
    const seconds =
      found.script.format === 'short' ? shortSeconds : planned?.seconds || durationSeconds(block.text, wordsPerMinute)
    return {
      draft,
      index,
      seconds,
      input: {
        block: {
          type: block.type,
          title: block.title,
          purpose: planned?.purpose ?? '',
          text: block.text,
          visual: block.visual,
        },
        previousText: blocks[index - 1]?.text ?? null,
        nextText: blocks[index + 1]?.text ?? null,
        voice: voiceInput(found.script.channelId),
        notes: found.script.notes,
        facts: factsInput(found.script.id),
        targetSeconds: seconds,
        wordsPerMinute,
      },
      outputTokens: expectedOutputTokens(seconds, wordsPerMinute, 1),
    }
  }

  const assertCanSearch = () => {
    if (!deps.webResearch()) throw new ApiError({ code: 'sin_internet' })
  }

  const unreliable = () => deps.knowledge.sources.data.unreliableDomains

  // What the AI cites, as the app can vouch for it: nothing it never saw, and every link tried (R7, R8).
  const checkedSources = async (raw: readonly { url: string; title: string }[][], seenUrls?: readonly string[]) => {
    const usable = raw.map((sources) =>
      seenSources(sources, seenUrls).filter(
        ({ url, title }) =>
          scriptSourceSchema.safeParse({
            id: 'x',
            url,
            reference: null,
            title,
            accessedAt: 'x',
            link: null,
          }).success,
      ),
    )
    const states = await deps.links.checkAll(usable.flat().map(({ url }) => url))
    const accessedAt = deps.now().toISOString()
    return usable.map((sources) =>
      sources.map(({ url, title }): ScriptSource => ({
        id: randomUUID(),
        url,
        reference: null,
        title,
        accessedAt,
        link: states.get(url) ?? 'sin_comprobar',
      })),
    )
  }

  // What each use asks for and what it does with the answer.
  const requestFor = (found: Found, use: ScriptUse, blockId?: string) => {
    const { script, idea, profile } = found
    const promptMeta = () => {
      const prompt = deps.promptFor(use)
      return { promptId: prompt.id, promptVersion: prompt.version }
    }
    // A Short has no outline, and a long video is written from one.
    const wrongShape =
      script.format === 'short'
        ? use === 'escaleta' || use === 'guion' || use === 'enfoques_short'
        : use === 'guion_short'
    if (wrongShape) throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })

    // Only the idea and the notes leave for a search: never the profile, nor anything else of the channel (R20).
    if (use === 'investigacion') {
      assertCanSearch()
      return {
        input: {
          idea: { title: idea.title, hook: idea.hook, query: idea.query, queryEn: idea.queryEn },
          notes: script.notes,
          language: found.channel.language,
          reliable: deps.knowledge.sources.data.reliable,
        },
        outputTokens: undefined,
        schema: undefined,
        keep: async (value: unknown, usageId: string | null, instructions: string | null, seenUrls?: string[]) => {
          const output = value as ResearchOutput
          // Nothing reliable found: the list stays as it was, and the screen says so (spec, Edge Cases).
          if (output.facts.length === 0) return
          const checked = await checkedSources(
            output.facts.map((fact) => fact.sources),
            seenUrls,
          )
          const researched = output.facts.map((fact, index): Fact => {
            const sources = checked[index]!
            return {
              id: randomUUID(),
              text: fact.text,
              label: factLabel(
                { proposed: fact.label, origin: 'ia', sources, alternatives: fact.alternatives },
                unreliable(),
              ),
              origin: 'ia',
              sources,
              alternatives: fact.alternatives,
            }
          })
          // What the creator added stays; what the AI found last time is in the history (data-model.md).
          const own = (versions.latest(script.id, 'hechos')?.content.facts ?? []).filter(
            (fact) => fact.origin === 'creador',
          )
          addVersion(
            found,
            'hechos',
            'ia',
            { facts: [...own, ...researched].slice(0, SCRIPT_LIMITS.facts) },
            { instructions, usageId, ...promptMeta() },
          )
        },
      }
    }

    if (use === 'enfoques_short') {
      const { blocks } = approvedDraft(script).content
      return {
        input: {
          blocks: blocks.map(({ id: blockId, type, title, text }) => ({ id: blockId, type, title, text })),
          idea: ideaInput(idea),
          profile: profileInput(profile),
          craft: deps.knowledge.craft.data,
          // What is already on the screen, so asking again brings something else. Never a source (ai-run.ts).
          alreadyOffered: anglesOf(script).map(({ title, blockId }) => ({ title, blockId })),
        },
        outputTokens: undefined,
        schema: shortAnglesOutputFor(blocks.map((block) => block.id)),
        // Asking again adds to what was paid for: nothing kept is dropped (principle II, decision 41).
        keep: (
          value: unknown,
          _usageId: string | null,
          _instructions: string | null,
          _seenUrls: string[] | undefined,
          claimsTrimmed: boolean,
        ) => {
          const fresh = (value as ShortAnglesOutput).angles.map((angle) => ({
            ...angle,
            moment: blocks.find((block) => block.id === angle.blockId)!.text,
            trimmed: claimsTrimmed,
            scriptId: null,
          }))
          scripts.setShortAngles(script.id, [...keptAngles(scripts.get(script.id)!), ...fresh])
        },
      }
    }

    if (use === 'comprobar_guion') {
      assertCanSearch()
      const draft = versions.latest(script.id, 'guion')
      if (!draft) throw new ApiError({ code: 'no_encontrado' })
      // A mark already answered is not paid for again (decision 49).
      const pending = draft.content.claims.filter(needsSearch)
      if (pending.length === 0) throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
      return {
        input: {
          claims: pending.map((claim) => ({
            id: claim.id,
            text: claim.text,
            context: draft.content.blocks.find((block) => block.id === claim.blockId)?.text ?? '',
          })),
          facts: factsInput(script.id),
          language: found.channel.language,
          reliable: deps.knowledge.sources.data.reliable,
        },
        outputTokens: undefined,
        schema: checkOutputFor(pending.map((claim) => claim.id)),
        keep: async (value: unknown, usageId: string | null, _: string | null, seenUrls?: string[]) => {
          const { checks } = value as CheckOutput
          const checked = await checkedSources(
            checks.map((check) => check.sources),
            seenUrls,
          )
          const checkedAt = deps.now().toISOString()
          const byClaim = new Map(checks.map((check, index) => [check.claimId, { check, sources: checked[index]! }]))
          // The text does not change here: only accepting a proposal does (FR-004c, US6 AS5).
          const claims = draft.content.claims.map((claim) => {
            const entry = byClaim.get(claim.id)
            if (!entry || claim.status !== 'pendiente') return claim
            const { check, sources } = entry
            // A verdict with no link that opens behind it is only an opinion of the AI.
            const backed = backingDomains(sources, unreliable()) > 0
            return {
              ...claim,
              check: {
                verdict: backed ? check.verdict : ('sin_fuente' as const),
                sources,
                // A wording nothing backs is not offered: the mark stays pending (decision 35).
                proposal: backed ? check.proposal : null,
                checkedAt,
              },
            }
          })
          addVersion(
            found,
            'guion',
            'comprobacion',
            { blocks: draft.content.blocks, claims },
            {
              factsVersion: draft.factsVersion,
              outlineVersion: draft.outlineVersion,
              writtenWith: writtenWith(draft),
              usageId,
              ...promptMeta(),
            },
          )
        },
      }
    }

    if (use === 'guion_short') {
      const { wordsPerMinute } = voiceOf(script.channelId)
      const previous = versions.latest(script.id, 'guion')
      const angle = angleOf(found)
      return {
        input: {
          idea: ideaInput(idea),
          profile: profileInput(profile),
          voice: voiceInput(script.channelId),
          notes: script.notes,
          facts: factsInput(script.id),
          targetSeconds: script.targetSeconds,
          wordsPerMinute,
          craft: deps.knowledge.craft.data,
          angle: angle && { title: angle.title, hook: angle.hook, moment: angle.moment },
        },
        outputTokens: expectedOutputTokens(script.targetSeconds, wordsPerMinute, 3),
        schema: shortDraftOutputFor(shortMaxSeconds, wordsPerMinute),
        keep: (value: unknown, usageId: string | null, instructions: string | null) => {
          const output = value as ShortDraftOutput
          // The same three blocks when it is asked for again, so versions can be compared.
          const blocks = output.blocks.map((block, index) => ({
            id: previous?.content.blocks[index]?.id ?? randomUUID(),
            type: block.type,
            title: '',
            text: block.text,
            visual: block.visual,
          }))
          const idOf = (type: string) => blocks.find((block) => block.type === type)!.id
          const claims = claimsFor(
            found,
            blocks,
            output.claims.map((claim) => ({ blockId: idOf(claim.type), text: claim.text, factId: claim.factId })),
          )
          addVersion(
            found,
            'guion',
            'ia',
            { blocks, claims },
            {
              factsVersion: versions.latestNumber(script.id, 'hechos'),
              outlineVersion: null,
              instructions,
              usageId,
              ...promptMeta(),
            },
          )
          // Written from the moment as the long script says it now: what it is checked against from here on.
          if (angle && angle.version !== script.sourceDraftVersion) scripts.setSourceDraft(script.id, angle.version)
        },
      }
    }

    if (use === 'guion') {
      const outline = approvedOutline(script)
      const { wordsPerMinute } = voiceOf(script.channelId)
      return {
        input: {
          outline: outline.content,
          idea: ideaInput(idea),
          profile: profileInput(profile),
          voice: voiceInput(script.channelId),
          notes: script.notes,
          facts: factsInput(script.id),
          targetSeconds: script.targetSeconds,
          wordsPerMinute,
          craft: deps.knowledge.craft.data,
        },
        outputTokens: expectedOutputTokens(script.targetSeconds, wordsPerMinute, outline.content.blocks.length),
        schema: draftOutputFor(outline.content.blocks.map((block) => block.id)),
        keep: (value: unknown, usageId: string | null, instructions: string | null) => {
          const output = value as DraftOutput
          const blocks = outline.content.blocks.map((block, index) => ({
            id: block.id,
            type: block.type,
            title: block.title,
            text: output.blocks[index]!.text,
            visual: output.blocks[index]!.visual,
          }))
          const claims = claimsFor(
            found,
            blocks,
            output.claims.map((claim) => ({ blockId: claim.outlineBlockId, text: claim.text, factId: claim.factId })),
          )
          addVersion(
            found,
            'guion',
            'ia',
            { blocks, claims },
            {
              factsVersion: versions.latestNumber(script.id, 'hechos'),
              outlineVersion: outline.version,
              instructions,
              usageId,
              ...promptMeta(),
            },
          )
        },
      }
    }

    if (use === 'bloque_guion') {
      const { draft, index, input, outputTokens } = blockRequest(found, blockId)
      return {
        input,
        outputTokens,
        schema: blockOutput,
        keep: (value: unknown, usageId: string | null, instructions: string | null) => {
          const output = value as BlockOutput
          const target = draft.content.blocks[index]!
          // Only this block is touched: the others are copied as they are, with their edits (SC-004).
          const blocks = draft.content.blocks.map((block) =>
            block.id === target.id ? { ...block, text: output.text, visual: output.visual } : block,
          )
          const fresh = claimsFor(
            found,
            [{ id: target.id, text: output.text }],
            output.claims.map((claim) => ({ blockId: target.id, text: claim.text, factId: claim.factId })),
          )
          const claims = [...draft.content.claims.filter((claim) => claim.blockId !== target.id), ...fresh]
          addVersion(
            found,
            'guion',
            'bloque_ia',
            { blocks, claims },
            {
              factsVersion: draft.factsVersion,
              outlineVersion: draft.outlineVersion,
              writtenWith: writtenWith(draft),
              instructions,
              usageId,
              ...promptMeta(),
            },
          )
        },
      }
    }

    return {
      input: outlineInput(found),
      outputTokens: undefined,
      schema: undefined,
      keep: (value: unknown, usageId: string | null, instructions: string | null) => {
        const { blocks } = value as { blocks: Omit<OutlineContent['blocks'][number], 'id'>[] }
        // The same place keeps its id, so another proposal can be compared block by block.
        const previous = versions.latest(script.id, 'escaleta')
        addVersion(
          found,
          'escaleta',
          'ia',
          {
            blocks: blocks.map((block, index) => ({
              ...block,
              id: previous?.content.blocks[index]?.id ?? randomUUID(),
            })),
          },
          {
            factsVersion: versions.latestNumber(script.id, 'hechos'),
            instructions,
            usageId,
            ...promptMeta(),
          },
        )
      },
    }
  }

  const estimate = (id: string, use: ScriptUse, blockId?: string) => {
    const found = find(id)
    const { input, outputTokens } = requestFor(found, use, blockId)
    return aiRun.estimate({ journeyId: journeyOf(found.script.channelId), use, input, outputTokens })
  }

  // Runs in the background: the creator can close the tab and find the result on coming back (R12).
  const generate = (id: string, { use, estimateId, instructions, blockId }: ScriptGenerateBody) => {
    const found = find(id)
    assertIdle(found.script)
    const journeyId = journeyOf(found.script.channelId)
    aiRun.assertEstimate(estimateId, use, journeyId)
    const { input, keep, schema } = requestFor(found, use, blockId)
    const job = deps.jobs.start({ journeyId: null, channelId: found.script.channelId, kind: 'ia' }, async () => {
      const result = await aiRun.run({ estimateId, journeyId, use, input, instructions, ...(schema ? { schema } : {}) })
      if (!result.ok) return { failure: result.failure }
      await keep(result.value, result.usageId, instructions ?? null, result.seenUrls, result.claimsTrimmed)
      return undefined
    })
    scripts.setJob(found.script.id, job.id, use)
    return job.id
  }

  // The creator's list: what is theirs says so, and a label is never taken from what the page sends (FR-004d, R8).
  const saveFacts = async (id: string, { baseVersion, content }: FactsSaveBody) => {
    const found = find(id)
    assertIdle(found.script)
    const latest = versions.latest(found.script.id, 'hechos')
    assertBase(latest?.version ?? null, baseVersion)
    const ids = content.facts.map((fact) => fact.id)
    if (new Set(ids).size !== ids.length) throw new ApiError({ code: 'validacion', fields: { facts: 'no_valido' } })

    const previous = new Map((latest?.content.facts ?? []).map((fact) => [fact.id, fact]))
    const known = new Map(
      (latest?.content.facts ?? []).flatMap((fact) => fact.sources.flatMap((one) => (one.url ? [[one.url, one]] : []))),
    ) as Map<string, ScriptSource>
    const fresh = content.facts.flatMap((fact) =>
      fact.sources.flatMap((one) => (one.url !== null && !known.has(one.url) ? [one.url] : [])),
    )
    const states: Map<string, LinkState> = fresh.length > 0 ? await deps.links.checkAll(fresh) : new Map()
    // The links took a moment: nothing may have been saved on top in the meantime.
    assertIdle(scripts.get(id)!)
    assertBase(versions.latestNumber(found.script.id, 'hechos'), baseVersion)
    const accessedAt = deps.now().toISOString()

    const facts = content.facts.map((fact): Fact => {
      const before = previous.get(fact.id)
      const sources = fact.sources.map((one): ScriptSource => {
        const seen =
          one.url === null
            ? before?.sources.find((other) => other.url === null && other.reference === one.reference)
            : (before?.sources.find(({ url }) => url === one.url) ?? known.get(one.url))
        if (seen) return { ...seen, title: one.title }
        return {
          ...one,
          accessedAt,
          link: one.url === null ? null : (states.get(one.url) ?? 'sin_comprobar'),
        }
      })
      // A sentence of the AI that the creator rewrites or backs with a source of their own, or a new one, is theirs:
      // it says so, and it survives another search (decision 34).
      const added = sources.some(
        (one) =>
          !before?.sources.some((other) =>
            one.url === null ? other.url === null && other.reference === one.reference : other.url === one.url,
          ),
      )
      if (!before || before.origin === 'creador' || before.text !== fact.text || added) {
        return { ...fact, sources, origin: 'creador', label: 'del_creador' }
      }
      // Taking sources away can only lower what the AI said about it.
      const { alternatives } = before
      const sameSources =
        JSON.stringify(sources.map((one) => one.url)) === JSON.stringify(before.sources.map((one) => one.url))
      const label = sameSources
        ? before.label
        : factLabel({ proposed: before.label, origin: 'ia', sources, alternatives }, unreliable())
      return { ...fact, sources, origin: 'ia', label, alternatives }
    })

    if (JSON.stringify(facts) !== JSON.stringify(latest?.content.facts ?? [])) {
      addVersion(found, 'hechos', 'edicion', { facts })
    }
    return view(scripts.get(id)!, found.idea, found.profileVersion)
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

  // Costs nothing: the idea and its script are created here, and writing it is a request of its own (FR-019).
  const chooseShortAngle = (id: string, index: number, baseUpdatedAt: string) => {
    const found = find(id)
    assertIdle(found.script)
    // Which one it is depends on the list that was on the screen (spec, Edge Cases: two tabs).
    if (found.script.updatedAt !== baseUpdatedAt) throw new ApiError({ code: 'version_cambiada' })
    if (found.script.format !== 'largo') throw new ApiError({ code: 'validacion', fields: { format: 'no_valido' } })
    const draft = approvedDraft(found.script)
    // `index` is its place in what is kept, so one that stopped being offered is never taken by mistake.
    const angle = anglesOf(found.script).find((one) => one.index === index)
    const block = draft.content.blocks.find((one) => one.id === angle?.blockId)
    if (!angle || !block) throw new ApiError({ code: 'no_encontrado' })
    // One Short per angle: the second would be the same idea twice in the bank (decision 43).
    if (angle.scriptId !== null) throw new ApiError({ code: 'validacion', fields: { index: 'no_valido' } })
    const { channel, idea: source, profileVersion } = found
    return inTransaction(deps.db, () => {
      const idea = ideas.create({
        channelId: channel.id,
        origin: 'otro_enfoque',
        sourceIdeaId: source.id,
        title: angle.title,
        hook: angle.hook,
        pillar: source.pillar,
        format: 'short',
        profileVersion,
      })
      const script = scripts.create({
        channelId: channel.id,
        ideaId: idea.id,
        format: 'short',
        targetSeconds: defaultTargetSeconds('short'),
        sourceScriptId: found.script.id,
        sourceBlockId: block.id,
        sourceDraftVersion: draft.version,
      })
      const facts = versions.latest(found.script.id, 'hechos')
      if (facts) addVersion({ ...found, script, idea }, 'hechos', 'heredada', facts.content)
      // Marking it moves the long script, so a second tab with the same list gets `version_cambiada`.
      const kept = keptAngles(found.script)
      kept[index] = { ...storedAngles(found.script)[index]!, scriptId: script.id }
      scripts.setShortAngles(found.script.id, kept)
      return { ideaId: idea.id, scriptId: script.id }
    })
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

  const currentDraft = (found: Found, baseVersion: number) => {
    assertIdle(found.script)
    const latest = versions.latest(found.script.id, 'guion')
    assertBase(latest?.version ?? null, baseVersion)
    if (!latest) throw new ApiError({ code: 'no_encontrado' })
    return latest
  }

  const editDraft = (found: Found, latest: ScriptVersion<'guion'>, content: DraftContent) =>
    addVersion(found, 'guion', 'edicion', content, {
      factsVersion: latest.factsVersion,
      outlineVersion: latest.outlineVersion,
      writtenWith: writtenWith(latest),
    })

  // The creator changes what is said and seen; the blocks and the marks are the server's (R9: their text is not marked).
  const saveDraft = (id: string, { baseVersion, content }: DraftSaveBody) => {
    const found = find(id)
    const latest = currentDraft(found, baseVersion)
    const sameBlocks =
      content.blocks.length === latest.content.blocks.length &&
      content.blocks.every((block, index) => block.id === latest.content.blocks[index]!.id)
    if (!sameBlocks) throw new ApiError({ code: 'validacion', fields: { blocks: 'no_valido' } })
    const blocks = latest.content.blocks.map((block, index) => ({
      ...block,
      text: content.blocks[index]!.text,
      visual: content.blocks[index]!.visual,
    }))
    // Saving what was already there is not a change: it must not take an approved script back to draft.
    if (JSON.stringify(blocks) !== JSON.stringify(latest.content.blocks)) {
      editDraft(found, latest, { blocks, claims: settleOrphans(latest.content.claims, blocks) })
    }
    return view(scripts.get(id)!, found.idea, found.profileVersion)
  }

  const actOnClaim = (id: string, claimId: string, { baseVersion, action, text }: ClaimActionBody) => {
    const found = find(id)
    const latest = currentDraft(found, baseVersion)
    const claim = latest.content.claims.find((one) => one.id === claimId)
    if (!claim) throw new ApiError({ code: 'no_encontrado' })
    if (claim.status !== 'pendiente') throw new ApiError({ code: 'conflicto', fields: { claim: 'no_valido' } })
    const withClaim = (changed: Partial<Claim>) =>
      latest.content.claims.map((one) => (one.id === claimId ? { ...one, ...changed } : one))

    if (action === 'confirmar' || action === 'no_es_dato') {
      const content = {
        blocks: latest.content.blocks,
        claims: withClaim({ status: action === 'confirmar' ? ('confirmada' as const) : ('sin_marca' as const) }),
      }
      // Forty marks are one line of the history (R10), unless that line is what was approved.
      if (latest.origin === 'marcas' && found.script.draftApprovedVersion !== latest.version) {
        versions.updateMarks(found.script.id, content)
        scripts.touch(found.script.id)
      } else {
        addVersion(found, 'guion', 'marcas', content, {
          factsVersion: latest.factsVersion,
          outlineVersion: latest.outlineVersion,
          writtenWith: writtenWith(latest),
        })
      }
      return view(scripts.get(id)!, found.idea, found.profileVersion)
    }

    const rewrite = (change: (text: string) => string) =>
      latest.content.blocks.map((block) =>
        block.id === claim.blockId ? { ...block, text: change(block.text) } : block,
      )
    const proposal = claim.check?.proposal
    let blocks: DraftContent['blocks']
    let changed: Partial<Claim>
    if (action === 'corregir') {
      if (!text) throw new ApiError({ code: 'validacion', fields: { text: 'no_valido' } })
      blocks = rewrite((one) => replaceFragment(one, claim.text, text))
      changed = { status: 'corregida', text }
    } else if (action === 'aceptar_propuesta') {
      if (!proposal) throw new ApiError({ code: 'validacion', fields: { action: 'no_valido' } })
      blocks = rewrite((one) => replaceFragment(one, claim.text, proposal))
      changed = { status: 'corregida', text: proposal }
    } else {
      blocks = rewrite((one) => withoutFragment(one, claim.text))
      changed = { status: 'quitada' }
    }
    // What changes the text is never grouped: each one stays in the history (R10, principle II).
    editDraft(found, latest, { blocks, claims: settleOrphans(withClaim(changed), blocks) })
    return view(scripts.get(id)!, found.idea, found.profileVersion)
  }

  const approveDraft = (id: string, version: number, acknowledgedPending: number) => {
    const found = find(id)
    assertIdle(found.script)
    const latest = versions.latest(found.script.id, 'guion')
    if (!latest || latest.version !== version) throw new ApiError({ code: 'version_cambiada' })
    if (latest.content.blocks.some((block) => block.text.trim() === '')) {
      throw new ApiError({ code: 'validacion', fields: { blocks: 'no_valido' } })
    }
    // The creator approved knowing how many were left: that number has to be the real one (FR-016).
    const pending = latest.content.claims.filter((claim) => claim.status === 'pendiente').length
    if (pending !== acknowledgedPending)
      throw new ApiError({ code: 'conflicto', fields: { acknowledgedPending: 'no_valido' } })
    return view(scripts.approveDraft(id, version, pending), found.idea, found.profileVersion)
  }

  const exportItem = (script: Script): ScriptExportItem => {
    const idea = ideas.get(script.ideaId)
    // The columns keep the last approval; what counts is whether the latest text is the one approved.
    const approved = statusOf(script) === 'guion_aprobado'
    return {
      title: idea?.title ?? '',
      hook: idea?.hook ?? '',
      format: script.format,
      status: statusOf(script),
      targetSeconds: script.targetSeconds,
      wordsPerMinute: voiceOf(script.channelId).wordsPerMinute,
      notes: script.notes,
      facts: versions.latest(script.id, 'hechos')?.content ?? null,
      outline: versions.latest(script.id, 'escaleta')?.content ?? null,
      draft: versions.latest(script.id, 'guion')?.content ?? null,
      approvedAt: approved ? script.draftApprovedAt : null,
      approvedPending: approved ? script.draftApprovedPending : null,
    }
  }

  const exportOne = (id: string) => {
    const { script, channel } = find(id)
    return { channel, item: exportItem(script) }
  }

  // Only what has something in it: an idea opened and left does not make an empty chapter.
  const exportAll = (channelId: string) => {
    const { channel } = withProfile(channelId)
    const items = scripts.listByChannel(channel.id).map(exportItem)
    return {
      channel,
      items: items.filter((item) => item.notes.trim() !== '' || item.facts || item.outline || item.draft),
    }
  }

  const settings = (channelId: string) => voiceOf(withProfile(channelId).channel.id)

  const saveSettings = (channelId: string, body: Parameters<ScriptsRepo['saveSettings']>[1]) => {
    const { channel } = withProfile(channelId)
    scripts.saveSettings(channel.id, body)
    return voiceOf(channel.id)
  }

  const summaryOf = ({ version, origin, createdAt, restoredFrom }: ScriptVersion) => ({
    version,
    origin,
    createdAt,
    restoredFrom,
  })

  const listVersions = (id: string, kind: ScriptKind) => versions.summaries(find(id).script.id, kind)

  const readVersion = (id: string, kind: ScriptKind, number: number) => {
    const { script } = find(id)
    const older = versions.get(script.id, kind, number)
    const latest = versions.latest(script.id, kind)
    if (!older || !latest) throw new ApiError({ code: 'no_encontrado' })
    const before = comparableItems(kind, older.content)
    const after = comparableItems(kind, latest.content)
    return {
      version: summaryOf(older),
      changes: compareItems(before, after),
      orderChanged: orderChanged(before, after),
    }
  }

  // A copy as the newest: nothing is lost, and what it was written with goes with it (R1, data-model.md «Avisos»).
  const restoreVersion = (id: string, kind: ScriptKind, number: number, baseVersion: number) => {
    const found = find(id)
    assertIdle(found.script)
    const latest = versions.latest(found.script.id, kind)
    assertBase(latest?.version ?? null, baseVersion)
    const older = versions.get(found.script.id, kind, number)
    if (!older) throw new ApiError({ code: 'no_encontrado' })
    if (older.version !== latest?.version) {
      addVersion(found, kind, 'recuperada', older.content, {
        factsVersion: older.factsVersion,
        outlineVersion: older.outlineVersion,
        instructions: older.instructions,
        restoredFrom: older.version,
        writtenWith: { ideaRevision: older.ideaRevision, profileVersion: older.profileVersion },
      })
    }
    return view(scripts.get(id)!, found.idea, found.profileVersion)
  }

  return {
    listVersions,
    readVersion,
    restoreVersion,
    approveDraft,
    exportOne,
    exportAll,
    reviewRules: () => deps.knowledge.review.data,
    saveDraft,
    actOnClaim,
    settings,
    saveSettings,
    withProfile,
    find,
    assertIdle,
    view,
    summaries,
    openForIdea,
    shortMaxSeconds,
    estimate,
    generate,
    saveFacts,
    chooseShortAngle,
    saveOutline,
    approveOutline,
    ideaScript(ideaId: string): { id: string; status: ReturnType<typeof statusOf>; fromVideo: boolean } | null {
      const script = scripts.getByIdea(ideaId)
      return script ? { id: script.id, status: statusOf(script), fromVideo: script.sourceScriptId !== null } : null
    },
  }
}

export type ScriptService = ReturnType<typeof createScriptService>
