import { randomUUID } from 'node:crypto'
import {
  channelProfileSchema,
  blockOutput,
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
  type ChannelProfile,
  type Claim,
  type ContentOf,
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
  // When shorts.json was reviewed: the maximum is shown with its date (principle V).
  shortsReviewedAt: string
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
    return latest?.status === 'medida' && latest.ideaRevision === idea.revision ? latest : null
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
        maxReviewedAt: script.format === 'largo' ? null : deps.shortsReviewedAt,
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
  const knownOf = ({ script, idea }: { script: Script; idea: Idea }) => [
    script.notes,
    idea.title,
    idea.hook,
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

  // What each use asks for and what it does with the answer.
  const requestFor = (found: Found, use: ScriptUse, blockId?: string) => {
    const { script, idea, profile } = found
    const promptMeta = () => {
      const prompt = deps.promptFor(use)
      return { promptId: prompt.id, promptVersion: prompt.version }
    }
    // A Short has no outline, and a long video is written from one.
    const wrongShape = script.format === 'short' ? use === 'escaleta' || use === 'guion' : use === 'guion_short'
    if (wrongShape) throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })

    if (use === 'guion_short') {
      const { wordsPerMinute } = voiceOf(script.channelId)
      const previous = versions.latest(script.id, 'guion')
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
          angle: null,
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
    saveOutline,
    approveOutline,
    ideaScript(ideaId: string): { id: string; status: ReturnType<typeof statusOf> } | null {
      const script = scripts.getByIdea(ideaId)
      return script ? { id: script.id, status: statusOf(script) } : null
    },
  }
}

export type ScriptService = ReturnType<typeof createScriptService>
