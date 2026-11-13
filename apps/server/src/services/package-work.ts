import { randomUUID } from 'node:crypto'
import {
  channelProfileSchema,
  emptyPiece,
  formatKinds,
  PACKAGE_CONTENT_SCHEMAS,
  PUBLISH_LIMITS,
  stepKinds,
  stepApproved,
  AI_THUMBNAILS,
  thumbnailsOutputFor,
  TITLE_COUNTS,
  titlesOutputFor,
  type ThumbnailConcept,
  type Idea,
  type KindVersions,
  type PackageContentOf,
  type PackageKind,
  type PackageOrigin,
  type PublishUse,
  type ThumbnailsContent,
  type ThumbnailsOutput,
  type TitlesContent,
  type TitlesOutput,
} from '@ytcreator/core'
import type { PackageApproveBody, PackageGenerateBody, PackageView, PieceSaveBody } from '@ytcreator/core/api'
import type { PublishKnowledge } from '@ytcreator/knowledge'
import type { z } from 'zod'
import type { JourneysRepo } from '../db/repos/journeys.ts'
import type { PackageVersionsRepo } from '../db/repos/package-versions.ts'
import type { PackagesRepo, PublishPackage } from '../db/repos/packages.ts'
import type { ProfilesRepo } from '../db/repos/profiles.ts'
import type { Script } from '../db/repos/scripts.ts'
import type { ScriptVersionsRepo } from '../db/repos/script-versions.ts'
import { ApiError } from '../http/errors.ts'
import type { AiRunService, PromptRef } from './ai-run.ts'
import { profileInput } from './ideas.ts'
import type { JobsService } from './jobs.ts'
import { mainTitleOf, type PackageService } from './packages.ts'

export interface PackageWorkDeps {
  service: PackageService
  packages: PackagesRepo
  versions: PackageVersionsRepo
  scriptVersions: ScriptVersionsRepo
  profiles: ProfilesRepo
  journeys: JourneysRepo
  jobs: JobsService
  aiRun: AiRunService
  promptFor: (use: PublishUse) => PromptRef
  knowledge: PublishKnowledge
}

// The kinds the creator can write by hand so far; the others arrive with their stories (US2, US3).
const EDITABLE: readonly PackageKind[] = ['titulos', 'miniaturas']

type Found = ReturnType<PackageService['find']>

// What the package does: asking the AI, saving what the creator writes and approving each step
// (specs/006-publishing-package/contracts/http-api.md).
export function createPackageWork(deps: PackageWorkDeps) {
  const { service, packages, versions, scriptVersions, aiRun } = deps

  const journeyOf = (channelId: string) => {
    const journey = deps.journeys.getLast(channelId)
    if (!journey) throw new ApiError({ code: 'no_encontrado' })
    return journey.id
  }

  const profileOf = (channelId: string) => {
    const current = deps.profiles.getCurrent(channelId)
    if (!current) throw new ApiError({ code: 'conflicto', fields: { profile: 'sin_perfil' } })
    return channelProfileSchema.parse(current.profile)
  }

  const scriptApproved = ({ idea }: Found) => service.scriptStatusOf(idea.id) === 'guion_aprobado'

  // The approved script: what everything is written from. Without it nothing is asked for (FR-001).
  const approvedDraft = (found: Found) => {
    const { script } = found
    if (!scriptApproved(found) || script.draftApprovedVersion === null) throw new ApiError({ code: 'sin_aprobar' })
    const draft = scriptVersions.get(script.id, 'guion', script.draftApprovedVersion)
    if (!draft) throw new ApiError({ code: 'sin_aprobar' })
    return { version: draft.version, blocks: draft.content.blocks }
  }

  // An edit made while the script is back in draft keeps the version it was made from.
  const draftVersionOf = (script: Script, pkg: PublishPackage, kind: PackageKind) =>
    script.draftApprovedVersion ?? versions.latest(pkg.id, kind)?.draftVersion ?? 1

  const assertBase = (latest: number | null, baseVersion: number) => {
    if ((latest ?? 0) !== baseVersion) throw new ApiError({ code: 'version_cambiada' })
  }

  const addVersion = <K extends PackageKind>(
    pkg: PublishPackage,
    kind: K,
    origin: PackageOrigin,
    content: PackageContentOf<K>,
    extra: { draftVersion: number; mainTitle?: string | null; instructions?: string | null; usageId?: string | null },
    use?: PublishUse,
  ) => {
    const prompt = use ? deps.promptFor(use) : null
    versions.add({
      packageId: pkg.id,
      kind,
      origin,
      content,
      draftVersion: extra.draftVersion,
      mainTitle: extra.mainTitle ?? null,
      instructions: extra.instructions ?? null,
      usageId: extra.usageId ?? null,
      promptId: prompt?.id ?? null,
      promptVersion: prompt?.version ?? null,
    })
    packages.touch(pkg.id)
  }

  const titlesOf = (pkg: PublishPackage) => versions.latest(pkg.id, 'titulos')?.content ?? null

  // The chosen ones, those the creator wrote and those a thumbnail idea is for stay; what else the AI proposed before
  // makes room for the new ones (decision 25). A thumbnail never points to a title that is gone.
  const keptTitles = (pkg: PublishPackage) => {
    const titles = titlesOf(pkg)
    if (!titles) return []
    const thumbnails = versions.latest(pkg.id, 'miniaturas')?.content ?? null
    const chosen = new Set([
      ...(titles.main ? [titles.main] : []),
      ...titles.alternatives,
      ...(thumbnails?.concepts ?? []).flatMap((concept) => (concept.titleId ? [concept.titleId] : [])),
    ])
    return titles.candidates.filter((candidate) => chosen.has(candidate.id) || candidate.origin === 'creador')
  }

  // The chosen ones go last, right before the new ones, so that trimming to the limit never drops them.
  const keptConcepts = (thumbnails: ThumbnailsContent | null) => {
    if (!thumbnails) return []
    const chosen = new Set(thumbnails.chosen)
    const theirs = thumbnails.concepts.filter((concept) => !chosen.has(concept.id) && concept.origin === 'creador')
    return [...theirs, ...thumbnails.concepts.filter((concept) => chosen.has(concept.id))]
  }

  // Asking for more titles only makes sense if the fewest the AI gives fit in the list (decision 31).
  const titleRoom = (pkg: PublishPackage) => PUBLISH_LIMITS.candidates - keptTitles(pkg).length
  // The same for the thumbnail ideas: what the creator chose or edited is never trimmed to make room.
  const conceptRoom = (pkg: PublishPackage) =>
    PUBLISH_LIMITS.concepts - keptConcepts(versions.latest(pkg.id, 'miniaturas')?.content ?? null).length
  const assertRoom = (pkg: PublishPackage, use: PublishUse) => {
    const full = use === 'titulos' ? titleRoom(pkg) < TITLE_COUNTS[pkg.format].min : conceptRoom(pkg) < AI_THUMBNAILS
    if (full) throw new ApiError({ code: 'validacion', fields: { [use]: 'lleno' } })
  }

  const measuredInput = (view: PackageView) =>
    view.measured
      ? {
          query: view.measured.query,
          verdict: view.measured.verdict,
          similarTitles: view.measured.similarTitles,
          measuredAt: view.measured.measuredAt,
        }
      : null

  const limitsInput = () => ({
    titleMaxChars: deps.knowledge.youtube.data.titleMaxChars.value,
    mobileTitleChars: deps.knowledge.craft.data.mobileTitleChars.value,
  })

  const ideaInput = (idea: Idea) => ({ title: idea.title, hook: idea.hook, format: idea.format })

  interface Request {
    input: Record<string, unknown>
    schema: z.ZodType
    keep: (value: unknown, usageId: string | null, instructions: string | null) => void
  }

  const requestFor = (found: Found, use: PublishUse): Request => {
    const { pkg, idea, script } = found
    const draft = approvedDraft(found)
    const profile = profileInput(profileOf(pkg.channelId))
    const blocks = draft.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      text: block.text,
    }))

    if (use === 'titulos') {
      const titles = titlesOf(pkg)
      return {
        input: {
          idea: ideaInput(idea),
          format: pkg.format,
          draft: { blocks },
          profile,
          measured: measuredInput(service.view(pkg, script, idea)),
          limits: limitsInput(),
          craft: deps.knowledge.craft.data,
          previous: (titles?.candidates ?? []).map((candidate) => candidate.text),
        },
        schema: titlesOutputFor(
          pkg.format,
          blocks.map((block) => block.id),
        ),
        keep: (value, usageId, instructions) => {
          const kept = keptTitles(pkg)
          const fresh = (value as TitlesOutput).titles.map((title) => ({
            id: randomUUID(),
            text: title.text,
            why: title.why,
            blockId: title.blockId,
            origin: 'ia' as const,
          }))
          const latest = titlesOf(pkg)
          addVersion(
            pkg,
            'titulos',
            'ia',
            {
              candidates: [...kept, ...fresh.slice(0, PUBLISH_LIMITS.candidates - kept.length)],
              main: latest?.main ?? null,
              alternatives: latest?.alternatives ?? [],
            },
            { draftVersion: draft.version, instructions, usageId },
            use,
          )
        },
      }
    }

    // A thumbnail goes with a title: the main one has to be chosen first (FR-006).
    const titles = titlesOf(pkg)
    const main = mainTitleOf(titles)
    if (!titles || !main) throw new ApiError({ code: 'sin_aprobar' })
    const titleIds = [titles.main!, ...titles.alternatives]
    const textOf = (titleId: string) => titles.candidates.find((candidate) => candidate.id === titleId)!.text
    const thumbnails = versions.latest(pkg.id, 'miniaturas')?.content ?? null
    return {
      input: {
        mainTitle: main,
        alternatives: titles.alternatives.map(textOf),
        idea: ideaInput(idea),
        draft: { blocks: blocks.filter((block) => block.type === 'gancho' || block.type === 'cierre') },
        profile,
        craft: deps.knowledge.craft.data,
        previous: (thumbnails?.concepts ?? []).map((concept) => concept.scene),
      },
      schema: thumbnailsOutputFor(titleIds.length),
      keep: (value, usageId, instructions) => {
        const latest = versions.latest(pkg.id, 'miniaturas')?.content ?? null
        const fresh = (value as ThumbnailsOutput).concepts.map((concept) => ({
          id: randomUUID(),
          scene: concept.scene,
          bigText: concept.bigText,
          emotion: concept.emotion,
          composition: concept.composition,
          colors: concept.colors,
          titleId: titleIds[concept.titleIndex] ?? null,
          origin: 'ia' as const,
        }))
        const concepts = [...keptConcepts(latest), ...fresh].slice(-PUBLISH_LIMITS.concepts)
        addVersion(
          pkg,
          'miniaturas',
          'ia',
          {
            concepts,
            chosen: (latest?.chosen ?? []).filter((choice) => concepts.some((concept) => concept.id === choice)),
          },
          { draftVersion: draft.version, mainTitle: main, instructions, usageId },
          use,
        )
      },
    }
  }

  const estimate = (id: string, use: PublishUse) => {
    const found = service.find(id)
    if (!formatKinds(found.pkg.format).includes(use))
      throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
    assertRoom(found.pkg, use)
    const { input } = requestFor(found, use)
    return aiRun.estimate({ journeyId: journeyOf(found.pkg.channelId), use, input })
  }

  // Runs in the background: the creator can close the tab and find the result on coming back (FR-020).
  const generate = (id: string, { use, estimateId, instructions }: PackageGenerateBody) => {
    const found = service.find(id)
    service.assertIdle(found.pkg)
    if (!formatKinds(found.pkg.format).includes(use))
      throw new ApiError({ code: 'validacion', fields: { use: 'no_valido' } })
    const journeyId = journeyOf(found.pkg.channelId)
    aiRun.assertEstimate(estimateId, use, journeyId)
    assertRoom(found.pkg, use)
    const { input, keep, schema } = requestFor(found, use)
    const job = deps.jobs.start({ journeyId: null, channelId: found.pkg.channelId, kind: 'ia' }, async () => {
      const result = await aiRun.run({ estimateId, journeyId, use, input, instructions, schema })
      if (!result.ok) return { failure: result.failure }
      keep(result.value, result.usageId, instructions ?? null)
      return undefined
    })
    packages.setJob(found.pkg.id, job.id, use)
    return job.id
  }

  // What the creator writes is theirs: a text they rewrite is no longer the AI's, nor its reason or its block
  // (principle II). One they leave as it was keeps what the AI said, marked as its opinion.
  const titlesFromCreator = (sent: TitlesContent, before: TitlesContent | null): TitlesContent => {
    const known = new Map((before?.candidates ?? []).map((candidate) => [candidate.id, candidate]))
    return {
      ...sent,
      candidates: sent.candidates.map((candidate) => {
        const previous = known.get(candidate.id)
        return previous && previous.text === candidate.text
          ? previous
          : { id: candidate.id, text: candidate.text, why: '', blockId: null, origin: 'creador' as const }
      }),
    }
  }

  const sameConcept = (one: ThumbnailConcept, other: ThumbnailConcept) =>
    (['scene', 'bigText', 'emotion', 'composition', 'colors', 'titleId'] as const).every(
      (key) => one[key] === other[key],
    )

  const conceptsFromCreator = (
    sent: ThumbnailsContent,
    before: ThumbnailsContent | null,
    titles: TitlesContent | null,
  ): ThumbnailsContent => {
    const known = new Map((before?.concepts ?? []).map((concept) => [concept.id, concept]))
    const titleIds = new Set((titles?.candidates ?? []).map((candidate) => candidate.id))
    return {
      ...sent,
      concepts: sent.concepts.map((concept) => {
        const previous = known.get(concept.id)
        if (previous && sameConcept(previous, concept)) return previous
        // Only what the creator writes now is checked: an idea left as it was never blocks saving the others.
        if (concept.titleId !== null && !titleIds.has(concept.titleId))
          throw new ApiError({ code: 'validacion', fields: { titleId: 'no_valido' } })
        return { ...concept, origin: 'creador' as const }
      }),
    }
  }

  const savePiece = (id: string, kind: string, { baseVersion, content }: PieceSaveBody): PackageView => {
    const found = service.find(id)
    const { pkg, script } = found
    if (!EDITABLE.includes(kind as PackageKind) || !formatKinds(pkg.format).includes(kind as PackageKind))
      throw new ApiError({ code: 'validacion', fields: { kind: 'no_valido' } })
    service.assertIdle(pkg)
    const latest = versions.latest(pkg.id, kind as PackageKind)
    assertBase(latest?.version ?? null, baseVersion)
    const parsed = PACKAGE_CONTENT_SCHEMAS[kind as 'titulos' | 'miniaturas'].safeParse(content)
    if (!parsed.success) throw new ApiError({ code: 'validacion', fields: { content: 'no_valido' } })
    const draftVersion = draftVersionOf(script, pkg, kind as PackageKind)
    if (kind === 'titulos') {
      addVersion(pkg, 'titulos', 'edicion', titlesFromCreator(parsed.data as TitlesContent, titlesOf(pkg)), {
        draftVersion,
      })
    } else {
      const titles = titlesOf(pkg)
      const before = (latest?.content as ThumbnailsContent | undefined) ?? null
      const next = conceptsFromCreator(parsed.data as ThumbnailsContent, before, titles)
      // Choosing is not remaking: the ideas keep the title they were made for, and so does its warning (R16).
      const sameIdeas =
        before !== null &&
        before.concepts.length === next.concepts.length &&
        next.concepts.every((concept, index) => concept === before.concepts[index])
      addVersion(pkg, 'miniaturas', 'edicion', next, {
        draftVersion,
        mainTitle: sameIdeas ? (latest?.mainTitle ?? null) : mainTitleOf(titles),
      })
    }
    return service.read(pkg.id)
  }

  // A step is approved in the versions on screen: if another tab changed one, nothing is approved (R2).
  const approve = (id: string, { step, versions: sent }: PackageApproveBody): PackageView => {
    const found = service.find(id)
    const { pkg } = found
    service.assertIdle(pkg)
    if (!scriptApproved(found)) throw new ApiError({ code: 'sin_aprobar' })
    const latest = versions.latestNumbers(pkg.id)
    if (step === 'textos' && !stepApproved(pkg.format, 'portada', latest, pkg.coverApproved))
      throw new ApiError({ code: 'sin_aprobar' })
    const kinds = stepKinds(pkg.format, step)
    if (kinds.some((kind) => sent[kind] !== latest[kind])) throw new ApiError({ code: 'version_cambiada' })
    const empty = kinds.filter((kind) => {
      const piece = versions.latest(pkg.id, kind)
      return !piece || emptyPiece(kind, piece.content)
    })
    if (empty.length > 0)
      throw new ApiError({
        code: 'validacion',
        fields: Object.fromEntries(empty.map((kind) => [kind, 'no_valido' as const])),
      })
    const approved: KindVersions = Object.fromEntries(kinds.map((kind) => [kind, latest[kind]!]))
    packages.approveStep(pkg.id, step, approved)
    return service.read(pkg.id)
  }

  return { estimate, generate, savePiece, approve }
}

export type PackageWork = ReturnType<typeof createPackageWork>
